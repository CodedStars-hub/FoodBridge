import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Donation } from '../src/models/Donation.js';
import { DonationRequest } from '../src/models/DonationRequest.js';
import { expireDonations } from '../src/services/donationWorkflow.js';
const config = parseEnvironment({
  NODE_ENV: 'test',
  JWT_SECRET: 'replica-set-isolated-test-secret-at-least-32-characters',
});
const app = createApp(config);
let replica;
let actors;
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({
    binary: {
      version: '7.0.24',
      downloadDir: '/tmp/foodbridge-mongodb-binaries',
    },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(replica.getUri(), {
    dbName: 'foodbridge_workflow_test',
  });
  await Promise.all([User.init(), Donation.init(), DonationRequest.init()]);
}, 180000);
afterAll(async () => {
  await mongoose.disconnect();
  if (replica) await replica.stop();
}, 30000);
beforeEach(async () => {
  await Promise.all([
    DonationRequest.deleteMany({}),
    Donation.deleteMany({}),
    User.deleteMany({}),
  ]);
  const inputs = [
    ['donor', 'donor', 'pending'],
    ['other', 'donor', 'pending'],
    ['ngo', 'ngo', 'verified'],
    ['second', 'ngo', 'verified'],
    ['pending', 'ngo', 'pending'],
    ['volunteer', 'volunteer', 'pending'],
  ];
  const users = await User.create(
    inputs.map(([name, role, verificationStatus]) => ({
      name,
      role,
      verificationStatus,
      email: `${name}@example.test`,
      passwordHash: 'fixture-not-used-for-password-login',
      ...(role === 'ngo' ? { organizationName: `${name} community` } : {}),
    })),
  );
  actors = Object.fromEntries(users.map((user) => [user.name, user]));
});
afterEach(() => vi.restoreAllMocks());
function call(method, path, actor = 'donor', body) {
  let req = request(app)[method](path);
  if (actor) {
    const user = actors[actor];
    const token = jwt.sign({ version: 0 }, config.JWT_SECRET, {
      subject: String(user._id),
      expiresIn: 3600,
      issuer: 'foodbridge-api',
      audience: 'foodbridge-client',
      algorithm: 'HS256',
    });
    req = req.set('Cookie', `foodbridge_session=${token}`);
  }
  if (method !== 'get')
    req = req
      .set('Origin', config.CLIENT_ORIGIN)
      .set('X-CSRF-Protection', 'foodbridge')
      .send(body || {});
  return req;
}
function payload(overrides = {}) {
  return {
    title: 'Campus rice bowls',
    category: 'prepared-meals',
    description: 'Freshly prepared surplus rice bowls',
    quantity: 10,
    unit: 'servings',
    preparationTime: new Date(Date.now() - 3600000).toISOString(),
    pickupDeadline: new Date(Date.now() + 3600000).toISOString(),
    storageConditions: 'Kept refrigerated',
    packagingDetails: 'Sealed containers',
    handlingDetails: 'Keep upright and cool',
    allergenInformation: 'Contains sesame',
    pickupLocation: 'Campus cafeteria collection desk',
    ...overrides,
  };
}
async function donation(overrides) {
  const result = await call(
    'post',
    '/api/donations',
    'donor',
    payload(overrides),
  );
  expect(result.status).toBe(201);
  return result.body.donation;
}
async function submit(id, actor = 'ngo', quantity = 4) {
  return call('post', `/api/donations/${id}/requests`, actor, {
    requestedQuantity: quantity,
    message: 'For our community kitchen',
  });
}
async function pending(id, actor = 'ngo', quantity = 4) {
  const result = await submit(id, actor, quantity);
  expect(result.status).toBe(201);
  return result.body.request;
}
function action(id, action, actor = 'donor') {
  return call('patch', `/api/requests/${id}`, actor, { action });
}
async function inventory(id, remaining, reserved, completed = 0) {
  const doc = await Donation.findById(id);
  expect([
    doc.remainingQuantity,
    doc.reservedQuantity,
    doc.completedQuantity,
  ]).toEqual([remaining, reserved, completed]);
  expect(doc.quantity).toBe(remaining + reserved + completed);
}
describe('donation creation, validation, listing and ownership', () => {
  it('creates a donor-owned donation with server-owned inventory', async () => {
    const d = await donation();
    expect(d.donor).toBe(String(actors.donor._id));
    expect(d.status).toBe('available');
    await inventory(d._id, 10, 0);
    expect(
      (await call('get', `/api/donations/${d._id}`, 'ngo')).body.donation.donor,
    ).not.toHaveProperty('email');
  });
  it.each([
    { quantity: 0 },
    { quantity: 1.5 },
    { quantity: -2 },
    { unit: 'truck' },
    { storageConditions: '' },
    { allergenInformation: '' },
    { imageUrl: 'javascript:alert(1)' },
    { imageUrl: 'not-a-url' },
    { reservedQuantity: 99 },
    { donor: 'injected' },
    { title: '<script>bad</script>' },
  ])('rejects invalid fields %j', async (overrides) => {
    expect(
      (await call('post', '/api/donations', 'donor', payload(overrides)))
        .status,
    ).toBe(400);
    expect(await Donation.countDocuments()).toBe(0);
  });
  it('rejects invalid time windows', async () => {
    expect(
      (
        await call(
          'post',
          '/api/donations',
          'donor',
          payload({
            preparationTime: new Date(Date.now() + 100000).toISOString(),
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          'post',
          '/api/donations',
          'donor',
          payload({
            pickupDeadline: new Date(Date.now() - 10000).toISOString(),
          }),
        )
      ).status,
    ).toBe(400);
  });
  it.each([null, 'ngo', 'volunteer'])(
    'rejects unauthorized creation by %s',
    async (actor) => {
      expect(
        (await call('post', '/api/donations', actor, payload())).status,
      ).toBe(actor ? 403 : 401);
    },
  );
  it('enforces ownership on edit and cancellation and prevents inventory mass assignment', async () => {
    const d = await donation();
    expect(
      (
        await call('patch', `/api/donations/${d._id}`, 'other', {
          title: 'Stolen',
        })
      ).status,
    ).toBe(403);
    expect(
      (await call('post', `/api/donations/${d._id}/cancel`, 'other')).status,
    ).toBe(403);
    expect(
      (
        await call('patch', `/api/donations/${d._id}`, 'ngo', {
          title: 'Stolen',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('patch', `/api/donations/${d._id}`, null, {
          title: 'Stolen',
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call('patch', `/api/donations/${d._id}`, 'donor', {
          remainingQuantity: 30,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('patch', `/api/donations/${d._id}`, 'donor', {
          title: 'Updated bowls',
          quantity: 15,
        })
      ).status,
    ).toBe(200);
    await inventory(d._id, 15, 0);
  });
  it('paginates, filters by category/unit, searches literally, and scopes mine', async () => {
    await donation({ title: 'Campus [rice] bowls' });
    await donation({ category: 'bakery', title: 'Bread' });
    const filtered = await call(
      'get',
      '/api/donations?category=bakery&unit=servings&limit=1',
    );
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.pagination.total).toBe(1);
    expect((await call('get', '/api/donations?q=%00')).status).toBe(400);
    const literal = await call('get', '/api/donations?q=%5Brice%5D');
    expect(literal.status).toBe(200);
    expect(literal.body.items).toHaveLength(1);
    expect(
      (await call('get', '/api/donations?limit=1&page=2')).body.pagination
        .total,
    ).toBe(2);
    expect(
      (await call('get', '/api/donations/mine', 'other')).body.items,
    ).toHaveLength(0);
    expect((await call('get', '/api/donations?limit=999')).status).toBe(400);
  });
  it('returns useful invalid-id and not-found errors', async () => {
    expect((await call('get', '/api/donations/invalid')).status).toBe(400);
    expect(
      (await call('get', `/api/donations/${new mongoose.Types.ObjectId()}`))
        .status,
    ).toBe(404);
  });
  it('applies CSRF protection to donation mutations', async () => {
    expect(
      (await request(app).post('/api/donations').send(payload())).status,
    ).toBe(403);
  });
});
describe('requests and transaction-backed inventory', () => {
  it('allows pending NGOs to browse but only verified NGOs can request', async () => {
    const d = await donation();
    expect((await call('get', '/api/donations', 'pending')).status).toBe(200);
    for (const actor of ['pending', 'donor', 'volunteer'])
      expect((await submit(d._id, actor)).status).toBe(403);
    expect((await submit(d._id)).status).toBe(201);
    await inventory(d._id, 10, 0);
  });
  it('rejects oversized and fractional requests', async () => {
    const d = await donation();
    expect((await submit(d._id, 'ngo', 11)).status).toBe(409);
    expect((await submit(d._id, 'ngo', 1.5)).status).toBe(400);
  });
  it('prevents concurrent duplicate active requests', async () => {
    const d = await donation();
    const results = await Promise.all([submit(d._id), submit(d._id)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await DonationRequest.countDocuments({ active: true })).toBe(1);
    await inventory(d._id, 10, 0);
  });
  it('partially reserves stock on acceptance and releases it on cancellation', async () => {
    const d = await donation();
    const r = await pending(d._id);
    expect((await action(r._id, 'accept')).status).toBe(200);
    await inventory(d._id, 6, 4);
    expect((await action(r._id, 'cancel', 'ngo')).status).toBe(200);
    await inventory(d._id, 10, 0);
    expect((await pending(d._id)).status).toBe('pending');
  });
  it('rejects pending requests without changing inventory', async () => {
    const d = await donation();
    const r = await pending(d._id);
    const result = await action(r._id, 'reject');
    expect(result.status).toBe(200);
    expect(result.body.request.status).toBe('rejected');
    await inventory(d._id, 10, 0);
  });
  it('does not overbook concurrent acceptance from different NGOs', async () => {
    const d = await donation();
    const a = await pending(d._id, 'ngo', 7);
    const b = await pending(d._id, 'second', 7);
    const results = await Promise.all([
      action(a._id, 'accept'),
      action(b._id, 'accept'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    await inventory(d._id, 3, 7);
    expect(await DonationRequest.countDocuments({ status: 'accepted' })).toBe(
      1,
    );
    expect(await DonationRequest.countDocuments({ status: 'pending' })).toBe(1);
  });
  it('accepts concurrent partial reservations that fit exactly', async () => {
    const d = await donation();
    const a = await pending(d._id, 'ngo', 4);
    const b = await pending(d._id, 'second', 6);
    expect(
      (
        await Promise.all([action(a._id, 'accept'), action(b._id, 'accept')])
      ).map((r) => r.status),
    ).toEqual([200, 200]);
    await inventory(d._id, 0, 10);
    expect((await call('get', '/api/donations')).body.items).toHaveLength(0);
  });
  it('rolls back inventory if saving the accepted request fails', async () => {
    const d = await donation();
    const r = await pending(d._id);
    vi.spyOn(DonationRequest.prototype, 'save').mockRejectedValueOnce(
      new Error('injected persistence failure'),
    );
    expect((await action(r._id, 'accept')).status).toBe(500);
    await inventory(d._id, 10, 0);
    expect((await DonationRequest.findById(r._id)).status).toBe('pending');
  });
  it('rolls back the donation serialization write if request creation fails', async () => {
    const d = await donation();
    const before = await Donation.findById(d._id).select('+workflowVersion');
    vi.spyOn(DonationRequest, 'create').mockRejectedValueOnce(
      new Error('injected creation failure'),
    );
    expect((await submit(d._id)).status).toBe(500);
    const after = await Donation.findById(d._id).select('+workflowVersion');
    expect(after.workflowVersion).toBe(before.workflowVersion);
    expect(await DonationRequest.countDocuments()).toBe(0);
  });
  it('requires the owning donor and requesting NGO for transitions', async () => {
    const d = await donation();
    const r = await pending(d._id);
    expect((await action(r._id, 'accept', 'other')).status).toBe(403);
    expect((await action(r._id, 'accept', 'ngo')).status).toBe(403);
    expect((await action(r._id, 'cancel', 'second')).status).toBe(403);
    expect((await action(r._id, 'cancel', 'donor')).status).toBe(403);
  });
  it('rechecks NGO verification before acceptance', async () => {
    const d = await donation();
    const r = await pending(d._id);
    await User.updateOne(
      { _id: actors.ngo._id },
      { $set: { verificationStatus: 'rejected' } },
    );
    expect((await action(r._id, 'accept')).status).toBe(403);
    await inventory(d._id, 10, 0);
  });
  it('locks edits while requests are active and serializes listing cancellation', async () => {
    const d = await donation();
    const r = await pending(d._id);
    expect(
      (await call('patch', `/api/donations/${d._id}`, 'donor', { quantity: 1 }))
        .status,
    ).toBe(409);
    await action(r._id, 'accept');
    expect((await call('post', `/api/donations/${d._id}/cancel`)).status).toBe(
      409,
    );
    expect(
      (
        await call('patch', `/api/donations/${d._id}`, 'donor', {
          pickupLocation: 'Changed',
        })
      ).status,
    ).toBe(409);
  });
  it('cancels pending requests when their donor cancels the listing', async () => {
    const d = await donation();
    const r = await pending(d._id);
    expect((await call('post', `/api/donations/${d._id}/cancel`)).status).toBe(
      200,
    );
    expect((await DonationRequest.findById(r._id)).status).toBe('cancelled');
    expect((await submit(d._id, 'second')).status).toBe(409);
    expect((await action(r._id, 'accept')).status).toBe(409);
  });
  it('serializes concurrent submission with cancellation', async () => {
    const d = await donation();
    await Promise.all([
      submit(d._id),
      call('post', `/api/donations/${d._id}/cancel`),
    ]);
    expect(await DonationRequest.countDocuments({ active: true })).toBe(0);
    expect((await Donation.findById(d._id)).status).toBe('cancelled');
  });
  it('completes handover and receipt once without double-decrementing inventory', async () => {
    const d = await donation();
    const r = await pending(d._id, 'ngo', 10);
    expect((await action(r._id, 'receive', 'ngo')).status).toBe(409);
    await action(r._id, 'accept');
    expect((await action(r._id, 'accept')).status).toBe(409);
    expect((await action(r._id, 'handover')).status).toBe(200);
    await inventory(d._id, 0, 10);
    expect((await action(r._id, 'cancel', 'ngo')).status).toBe(409);
    expect((await action(r._id, 'receive', 'second')).status).toBe(403);
    expect((await action(r._id, 'receive', 'ngo')).status).toBe(200);
    await inventory(d._id, 0, 0, 10);
    expect((await Donation.findById(d._id)).status).toBe('completed');
    expect((await action(r._id, 'receive', 'ngo')).status).toBe(409);
    await inventory(d._id, 0, 0, 10);
    expect(
      (await call('get', '/api/requests/history', 'donor')).body.items,
    ).toHaveLength(1);
    expect(
      (await call('get', '/api/requests/history', 'ngo')).body.items,
    ).toHaveLength(1);
    expect(
      (await call('get', '/api/requests/history', 'other')).body.items,
    ).toHaveLength(0);
    expect(
      (await call('get', '/api/requests/history?status=rejected', 'ngo')).body
        .items,
    ).toHaveLength(0);
  });
  it('closes competing pending requests when all food is received', async () => {
    const d = await donation();
    const a = await pending(d._id, 'ngo', 10);
    const b = await pending(d._id, 'second', 2);
    await action(a._id, 'accept');
    await action(a._id, 'handover');
    await action(a._id, 'receive', 'ngo');
    expect((await DonationRequest.findById(b._id)).status).toBe('rejected');
    expect(await DonationRequest.countDocuments({ active: true })).toBe(0);
    await inventory(d._id, 0, 0, 10);
  });
  it('preserves the original requested unit after a permitted later listing edit', async () => {
    const d = await donation();
    const r = await pending(d._id);
    await action(r._id, 'cancel', 'ngo');
    expect(
      (await call('patch', `/api/donations/${d._id}`, 'donor', { unit: 'kg' }))
        .status,
    ).toBe(200);
    const history = await call('get', '/api/requests/history', 'ngo');
    expect(history.body.items[0].unit).toBe('servings');
    expect(history.body.items[0].donation.unit).toBe('kg');
  });
  it('records partial completion and preserves completed quantities on another cancellation', async () => {
    const d = await donation();
    const a = await pending(d._id, 'ngo', 4);
    const b = await pending(d._id, 'second', 3);
    await action(a._id, 'accept');
    await action(b._id, 'accept');
    await action(a._id, 'handover');
    await action(a._id, 'receive', 'ngo');
    await action(b._id, 'cancel', 'second');
    await inventory(d._id, 6, 0, 4);
    expect(
      (
        await call('patch', `/api/donations/${d._id}`, 'donor', {
          quantity: 20,
        })
      ).status,
    ).toBe(409);
  });
});
describe('server-enforced expiry', () => {
  async function expire(id) {
    await Donation.updateOne(
      { _id: id },
      { $set: { pickupDeadline: new Date(Date.now() - 1000) } },
    );
  }
  it('excludes expired listings before a sweep and blocks new requests/acceptance', async () => {
    const d = await donation();
    const r = await pending(d._id);
    await expire(d._id);
    expect(
      (await call('get', '/api/donations', 'pending')).body.items,
    ).toHaveLength(0);
    expect(
      (await call('get', `/api/donations/${d._id}`)).body.donation.status,
    ).toBe('expired');
    expect((await submit(d._id, 'second')).status).toBe(409);
    expect((await action(r._id, 'accept')).status).toBe(409);
    await inventory(d._id, 10, 0);
  });
  it('blocks late handover but permits cancellation and restores inventory', async () => {
    const d = await donation();
    const r = await pending(d._id);
    await action(r._id, 'accept');
    await expire(d._id);
    expect((await action(r._id, 'handover')).status).toBe(409);
    expect((await action(r._id, 'cancel', 'ngo')).status).toBe(200);
    await inventory(d._id, 10, 0);
  });
  it('idempotently expires requests and releases accepted stock', async () => {
    const d = await donation();
    const a = await pending(d._id);
    const b = await pending(d._id, 'second');
    await action(a._id, 'accept');
    await expire(d._id);
    expect(await expireDonations()).toBe(1);
    expect(await expireDonations()).toBe(0);
    await inventory(d._id, 10, 0);
    expect((await DonationRequest.findById(a._id)).status).toBe('expired');
    expect((await DonationRequest.findById(b._id)).status).toBe('expired');
    expect((await Donation.findById(d._id)).status).toBe('expired');
  });
  it('expires other pending requests after an NGO cancellation has already marked the listing expired', async () => {
    const d = await donation();
    const a = await pending(d._id);
    const b = await pending(d._id, 'second');
    await action(a._id, 'accept');
    await expire(d._id);
    await action(a._id, 'cancel', 'ngo');
    expect((await Donation.findById(d._id)).status).toBe('expired');
    expect(await expireDonations()).toBe(1);
    expect((await DonationRequest.findById(b._id)).status).toBe('expired');
    expect(await expireDonations()).toBe(0);
    await inventory(d._id, 10, 0);
  });
  it('serializes simultaneous expiry sweeps without releasing inventory twice', async () => {
    const d = await donation();
    const r = await pending(d._id);
    await action(r._id, 'accept');
    await expire(d._id);
    const changes = await Promise.all([expireDonations(), expireDonations()]);
    expect(changes.reduce((sum, n) => sum + n, 0)).toBe(1);
    await inventory(d._id, 10, 0);
    expect((await DonationRequest.findById(r._id)).status).toBe('expired');
  });
  it('preserves handed-over inventory for receipt after expiry', async () => {
    const d = await donation();
    const r = await pending(d._id, 'ngo', 10);
    await action(r._id, 'accept');
    await action(r._id, 'handover');
    await expire(d._id);
    await expireDonations();
    await inventory(d._id, 0, 10);
    expect((await action(r._id, 'receive', 'ngo')).status).toBe(200);
    await inventory(d._id, 0, 0, 10);
  });
});

// Milestone 4 exercises the same request/donation entities on the same isolated replica set.
const point = (longitude = 77.5946, latitude = 12.9716) => ({
  type: 'Point',
  coordinates: [longitude, latitude],
});
async function preparedPickup() {
  const d = await donation({ location: point() });
  const r = await pending(d._id);
  await action(r._id, 'accept');
  await User.updateOne(
    { _id: actors.ngo._id },
    {
      $set: {
        location: point(77.61, 12.98),
        address: 'NGO private delivery address',
      },
    },
  );
  const arranged = await call('post', `/api/requests/${r._id}/pickup`, 'ngo');
  expect(arranged.status).toBe(201);
  return { d, r };
}
async function eligibleVolunteers() {
  await User.updateOne(
    { _id: actors.volunteer._id },
    { $set: { verificationStatus: 'verified' } },
  );
  actors.courier = await User.create({
    name: 'courier',
    role: 'volunteer',
    verificationStatus: 'verified',
    email: 'courier@example.test',
    passwordHash: 'not-used',
  });
}
function pickupAction(id, actor, action, reason) {
  return call('patch', `/api/pickups/${id}`, actor, {
    action,
    ...(reason ? { reason } : {}),
  });
}
describe('GeoJSON and geospatial discovery', () => {
  it.each([
    point(181, 0),
    point(0, 91),
    { type: 'LineString', coordinates: [77, 12] },
    { type: 'Point', coordinates: [77] },
    { type: 'Point', coordinates: ['77', 12] },
  ])('rejects invalid donation coordinates %j', async (location) => {
    expect(
      (await call('post', '/api/donations', 'donor', payload({ location })))
        .status,
    ).toBe(400);
  });
  it('validates coordinates at model level and creates 2dsphere indexes', async () => {
    await expect(
      new Donation({
        ...payload(),
        donor: actors.donor._id,
        remainingQuantity: 10,
        location: point(-181, 0),
      }).validate(),
    ).rejects.toThrow();
    expect(
      (await Donation.collection.indexes()).some(
        (i) => i.key.location === '2dsphere',
      ),
    ).toBe(true);
    expect(
      (await User.collection.indexes()).some(
        (i) => i.key.location === '2dsphere',
      ),
    ).toBe(true);
  });
  it('saves private profile locations, supports zero coordinates and permits clearing them', async () => {
    const changed = await call('patch', '/api/users/me', 'ngo', {
      location: point(0, 0),
      address: 'Private delivery desk',
    });
    expect(changed.status).toBe(200);
    expect(changed.body.user.location.coordinates).toEqual([0, 0]);
    expect(changed.body.user.address).toBe('Private delivery desk');
    expect((await User.findById(actors.ngo._id)).location).toBeUndefined();
    expect(
      (await call('get', '/api/auth/me', 'ngo')).body.user.location.coordinates,
    ).toEqual([0, 0]);
    expect(
      (await call('patch', '/api/users/me', 'ngo', { location: point(300, 0) }))
        .status,
    ).toBe(400);
    expect(
      (
        await call('patch', '/api/users/me', 'ngo', {
          location: null,
          address: '',
        })
      ).status,
    ).toBe(200);
    expect(
      (await call('get', '/api/auth/me', 'ngo')).body.user,
    ).not.toHaveProperty('location');
  });
  it('uses real geospatial radius filtering and excludes unavailable, expired and missing-location donations', async () => {
    const near = await donation({ location: point(), title: 'Near food' });
    await donation({ location: point(78.7, 13.9), title: 'Far food' });
    await donation({ title: 'No coordinates' });
    const expired = await donation({ location: point() });
    await Donation.updateOne(
      { _id: expired._id },
      { $set: { pickupDeadline: new Date(Date.now() - 1) } },
    );
    const cancelled = await donation({ location: point() });
    await call('post', `/api/donations/${cancelled._id}/cancel`);
    const result = await call(
      'get',
      '/api/donations/nearby?longitude=77.5946&latitude=12.9716&radiusKm=5',
      'pending',
    );
    expect(result.status).toBe(200);
    expect(result.body.items.map((d) => d._id)).toEqual([near._id]);
    expect(result.body.items[0]).not.toHaveProperty('location');
    expect(result.body.items[0].areaLocation.coordinates).toEqual([
      77.59, 12.97,
    ]);
    expect(result.body.items[0].pickupLocation).not.toBe(
      'Campus cafeteria collection desk',
    );
    expect(
      (await call('get', '/api/donations', 'pending')).body.items.some(
        (d) => d.title === 'No coordinates',
      ),
    ).toBe(true);
  });
  it('handles missing coordinates, saved-location fallback and invalid query parameters', async () => {
    await donation({ location: point() });
    expect((await call('get', '/api/donations/nearby', 'ngo')).status).toBe(
      400,
    );
    await call('patch', '/api/users/me', 'ngo', { location: point() });
    expect(
      (await call('get', '/api/donations/nearby', 'ngo')).body.items,
    ).toHaveLength(1);
    for (const query of [
      'longitude=77',
      'longitude=181&latitude=12',
      'longitude=&latitude=12',
      'longitude=77&latitude=12&radiusKm=-1',
      'longitude=77&latitude=12&radiusKm=201',
    ])
      expect(
        (await call('get', `/api/donations/nearby?${query}`, 'ngo')).status,
      ).toBe(400);
    expect(
      (
        await call(
          'get',
          '/api/donations/nearby?longitude=77&latitude=12',
          'volunteer',
        )
      ).status,
    ).toBe(403);
  });
  it('keeps exact donation coordinates private until acceptance', async () => {
    const d = await donation({ location: point() });
    expect(
      (await call('get', `/api/donations/${d._id}`, 'ngo')).body.donation,
    ).not.toHaveProperty('location');
    expect(
      (await call('get', `/api/donations/${d._id}`, 'donor')).body.donation
        .location.coordinates,
    ).toEqual(point().coordinates);
    const r = await pending(d._id);
    await action(r._id, 'accept');
    expect(
      (await call('get', `/api/donations/${d._id}`, 'ngo')).body.donation
        .location.coordinates,
    ).toEqual(point().coordinates);
    expect(
      (await call('get', `/api/donations/${d._id}`, 'second')).body.donation,
    ).not.toHaveProperty('location');
  });
});
describe('explainable matching', () => {
  it('ranks exact quantity fits, normalizes scores and explicitly excludes insufficient inventory', async () => {
    const exact = await donation({
      location: point(),
      quantity: 4,
      title: 'Exact quantity',
    });
    await donation({
      location: point(),
      quantity: 20,
      title: 'Excess quantity',
    });
    await donation({ location: point(), quantity: 2, title: 'Too little' });
    await donation({ location: point(), quantity: 10, unit: 'kg' });
    const result = await call(
      'get',
      '/api/donations/recommendations?longitude=77.5946&latitude=12.9716&quantity=4&unit=servings',
      'ngo',
    );
    expect(result.status).toBe(200);
    expect(result.body.items[0]._id).toBe(exact._id);
    expect(result.body.items).toHaveLength(2);
    expect(result.body.eligibility.excludedInsufficientQuantity).toBe(1);
    expect(result.body.eligibility.partialFulfillment).toBe(false);
    const match = result.body.items[0].match;
    expect(match.fulfillment).toBe('complete');
    expect(match.components.distance).toBe(100);
    expect(match.components.quantity).toBe(100);
    expect(match.score).toBeCloseTo(
      Math.round(
        (0.4 * match.components.distance +
          0.35 * match.components.quantity +
          0.25 * match.components.pickupTime) *
          100,
      ) / 100,
      2,
    );
    for (const d of result.body.items)
      for (const value of Object.values(d.match.components))
        expect(value).toBeGreaterThanOrEqual(0);
  });
  it('requires quantity and unit and never silently returns partial fulfillment', async () => {
    await donation({ location: point(), quantity: 2 });
    expect(
      (
        await call(
          'get',
          '/api/donations/recommendations?longitude=77&latitude=12',
          'ngo',
        )
      ).status,
    ).toBe(400);
    const result = await call(
      'get',
      '/api/donations/recommendations?longitude=77.5946&latitude=12.9716&quantity=9&unit=servings',
      'ngo',
    );
    expect(result.body.items).toHaveLength(0);
    expect(result.body.eligibility.excludedInsufficientQuantity).toBe(1);
  });
  it('paginates ranked results with stable score/ID tie breaking', async () => {
    const a = await donation({ location: point(), title: 'A' });
    const b = await donation({ location: point(), title: 'B' });
    const deadline = new Date(Date.now() + 7200000);
    await Donation.updateMany(
      { _id: { $in: [a._id, b._id] } },
      { $set: { pickupDeadline: deadline } },
    );
    const first = await call(
      'get',
      '/api/donations/recommendations?longitude=77.5946&latitude=12.9716&quantity=4&unit=servings&limit=1',
      'ngo',
    );
    const second = await call(
      'get',
      '/api/donations/recommendations?longitude=77.5946&latitude=12.9716&quantity=4&unit=servings&limit=1&page=2',
      'ngo',
    );
    expect(first.body.pagination.total).toBe(2);
    expect(first.body.items[0]._id).toBe(a._id);
    expect(second.body.items[0]._id).toBe(b._id);
  });
});
describe('volunteer logistics linked to existing reservations', () => {
  it('requires accepted requests and coordinate/address availability without breaking direct handover', async () => {
    const d = await donation();
    const r = await pending(d._id);
    expect(
      (await call('post', `/api/requests/${r._id}/pickup`, 'ngo')).status,
    ).toBe(409);
    await action(r._id, 'accept');
    expect(
      (await call('post', `/api/requests/${r._id}/pickup`, 'ngo')).status,
    ).toBe(400);
    expect((await action(r._id, 'handover')).status).toBe(200);
    expect((await action(r._id, 'receive', 'ngo')).status).toBe(200);
    await inventory(d._id, 6, 0, 4);
  });
  it('requires NGO consent and rejects duplicate pickup creation', async () => {
    const { d, r } = await preparedPickup();
    expect(
      (await call('post', `/api/requests/${r._id}/pickup`, 'donor')).status,
    ).toBe(403);
    expect(
      (await call('post', `/api/requests/${r._id}/pickup`, 'second')).status,
    ).toBe(403);
    expect(
      (await call('post', `/api/requests/${r._id}/pickup`, 'ngo')).status,
    ).toBe(409);
    await inventory(d._id, 6, 4);
  });
  it('restricts available assignments and claims to verified volunteers', async () => {
    const { r } = await preparedPickup();
    expect(
      (await call('get', '/api/pickups/available', 'volunteer')).status,
    ).toBe(403);
    expect(
      (await call('post', `/api/pickups/${r._id}/claim`, 'volunteer')).status,
    ).toBe(403);
    expect(
      (await call('post', `/api/pickups/${r._id}/claim`, 'ngo')).status,
    ).toBe(403);
    await eligibleVolunteers();
    const available = await call('get', '/api/pickups/available', 'volunteer');
    expect(available.body.items).toHaveLength(1);
    expect(available.body.items[0].origin.address).toBe(
      'Approximate pickup area',
    );
    expect(available.body.items[0].destination.address).not.toBe(
      'NGO private delivery address',
    );
    expect(available.body.items[0]).not.toHaveProperty('events');
  });
  it('prevents concurrent volunteer double claims with a real MongoDB conditional transaction', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    const results = await Promise.all([
      call('post', `/api/pickups/${r._id}/claim`, 'volunteer'),
      call('post', `/api/pickups/${r._id}/claim`, 'courier'),
    ]);
    expect(results.map((v) => v.status).sort()).toEqual([200, 409]);
    expect((await DonationRequest.findById(r._id)).pickup.status).toBe(
      'assigned',
    );
    await inventory(d._id, 6, 4);
    expect(
      (await call('get', '/api/pickups/available', 'volunteer')).body.items,
    ).toHaveLength(0);
  });
  it('reveals exact stops only to the assigned volunteer and reservation participants', async () => {
    const { r } = await preparedPickup();
    await eligibleVolunteers();
    await call('post', `/api/pickups/${r._id}/claim`, 'volunteer');
    const mine = await call('get', `/api/pickups/${r._id}`, 'volunteer');
    expect(mine.body.assignment.locationPrecision).toBe('exact');
    expect(mine.body.assignment.destination.address).toBe(
      'NGO private delivery address',
    );
    expect((await call('get', `/api/pickups/${r._id}`, 'courier')).status).toBe(
      403,
    );
    expect((await call('get', `/api/pickups/${r._id}`, 'other')).status).toBe(
      403,
    );
    expect((await call('get', `/api/pickups/${r._id}`, 'second')).status).toBe(
      403,
    );
    expect(
      (await call('get', `/api/pickups/${r._id}`, 'donor')).body.assignment
        .locationPrecision,
    ).toBe('exact');
    expect(
      (await call('get', '/api/pickups/mine', 'ngo')).body.items,
    ).toHaveLength(1);
  });
  it('allows release and reassignment before handover without returning stock to availability', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    await call('post', `/api/pickups/${r._id}/claim`, 'volunteer');
    expect((await pickupAction(r._id, 'volunteer', 'start')).status).toBe(200);
    expect((await pickupAction(r._id, 'volunteer', 'release')).status).toBe(
      200,
    );
    await inventory(d._id, 6, 4);
    expect(
      (await call('post', `/api/pickups/${r._id}/claim`, 'courier')).status,
    ).toBe(200);
    expect((await pickupAction(r._id, 'volunteer', 'start')).status).toBe(403);
    const previous = await call('get', `/api/pickups/${r._id}`, 'volunteer');
    expect(previous.body.assignment.previouslyAssignedToMe).toBe(true);
    expect(previous.body.assignment.locationPrecision).toBe('approximate');
  });
  it('maps donor handover and NGO receipt atomically and prevents volunteer impersonation', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    expect((await action(r._id, 'handover')).status).toBe(409);
    await call('post', `/api/pickups/${r._id}/claim`, 'volunteer');
    expect((await pickupAction(r._id, 'volunteer', 'arrive')).status).toBe(409);
    expect((await action(r._id, 'handover', 'volunteer')).status).toBe(403);
    expect((await action(r._id, 'receive', 'volunteer')).status).toBe(403);
    expect((await pickupAction(r._id, 'volunteer', 'start')).status).toBe(200);
    expect((await action(r._id, 'handover')).body.request.pickup.status).toBe(
      'picked_up',
    );
    await inventory(d._id, 6, 4);
    expect((await pickupAction(r._id, 'volunteer', 'release')).status).toBe(
      409,
    );
    expect((await pickupAction(r._id, 'ngo', 'cancel')).status).toBe(409);
    expect((await pickupAction(r._id, 'volunteer', 'arrive')).status).toBe(200);
    expect((await DonationRequest.findById(r._id)).status).toBe('handed_over');
    expect((await pickupAction(r._id, 'volunteer', 'delivered')).status).toBe(
      400,
    );
    expect((await action(r._id, 'receive', 'second')).status).toBe(403);
    expect(
      (await action(r._id, 'receive', 'ngo')).body.request.pickup.status,
    ).toBe('delivered');
    await inventory(d._id, 6, 0, 4);
    expect(
      (await call('get', `/api/pickups/${r._id}`, 'volunteer')).body.assignment
        .locationPrecision,
    ).toBe('approximate');
    expect((await pickupAction(r._id, 'volunteer', 'start')).status).toBe(409);
  });
  it('allows transportation-only cancellation followed by direct handover', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    await call('post', `/api/pickups/${r._id}/claim`, 'volunteer');
    expect((await pickupAction(r._id, 'ngo', 'cancel')).status).toBe(200);
    await inventory(d._id, 6, 4);
    expect((await action(r._id, 'handover')).status).toBe(200);
    expect((await action(r._id, 'receive', 'ngo')).status).toBe(200);
    await inventory(d._id, 6, 0, 4);
  });
  it('supports reopening cancelled transportation and fresh destination snapshots', async () => {
    const { r } = await preparedPickup();
    await pickupAction(r._id, 'ngo', 'cancel');
    await User.updateOne(
      { _id: actors.ngo._id },
      { $set: { address: 'New private delivery address' } },
    );
    const next = await call('post', `/api/requests/${r._id}/pickup`, 'ngo');
    expect(next.status).toBe(201);
    expect(next.body.assignment.destination.address).toBe(
      'New private delivery address',
    );
    expect(next.body.assignment.status).toBe('awaiting_volunteer');
  });
  it('records failed pickup/reassignment and retains physical custody on delivery failure', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    await call('post', `/api/pickups/${r._id}/claim`, 'volunteer');
    expect(
      (
        await pickupAction(
          r._id,
          'volunteer',
          'report_failure',
          'Vehicle unavailable',
        )
      ).body.assignment.status,
    ).toBe('awaiting_volunteer');
    await call('post', `/api/pickups/${r._id}/claim`, 'courier');
    await action(r._id, 'handover');
    expect(
      (await pickupAction(r._id, 'courier', 'report_failure')).status,
    ).toBe(400);
    const issue = await pickupAction(
      r._id,
      'courier',
      'report_failure',
      'Destination contact unavailable',
    );
    expect(issue.status).toBe(200);
    expect(issue.body.assignment.issue).toBe('Destination contact unavailable');
    expect(issue.body.assignment.status).toBe('picked_up');
    await inventory(d._id, 6, 4);
    await action(r._id, 'receive', 'ngo');
    await inventory(d._id, 6, 0, 4);
  });
  it('rechecks volunteer eligibility before donor handover', async () => {
    const { r } = await preparedPickup();
    await eligibleVolunteers();
    await call('post', `/api/pickups/${r._id}/claim`, 'volunteer');
    await User.updateOne(
      { _id: actors.volunteer._id },
      { $set: { verificationStatus: 'rejected' } },
    );
    expect((await action(r._id, 'handover')).status).toBe(409);
    expect((await pickupAction(r._id, 'volunteer', 'release')).status).toBe(
      200,
    );
  });
  it('cancels linked logistics when the NGO cancels its reservation and restores inventory once', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    await call('post', `/api/pickups/${r._id}/claim`, 'volunteer');
    expect(
      (await action(r._id, 'cancel', 'ngo')).body.request.pickup.status,
    ).toBe('cancelled');
    await inventory(d._id, 10, 0);
    expect((await action(r._id, 'cancel', 'ngo')).status).toBe(409);
  });
  it('rejects expired claims and atomically expires uncollected logistics and reservations', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    await Donation.updateOne(
      { _id: d._id },
      { $set: { pickupDeadline: new Date(Date.now() - 1) } },
    );
    expect(
      (await call('post', `/api/pickups/${r._id}/claim`, 'volunteer')).status,
    ).toBe(409);
    expect(
      (await call('get', '/api/pickups/available', 'volunteer')).body.items,
    ).toHaveLength(0);
    await expireDonations();
    const closed = await DonationRequest.findById(r._id);
    expect(closed.status).toBe('expired');
    expect(closed.pickup.status).toBe('cancelled');
    await inventory(d._id, 10, 0);
    expect(await expireDonations()).toBe(0);
  });
  it('does not release picked-up food at expiry and still requires NGO receipt', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    await call('post', `/api/pickups/${r._id}/claim`, 'volunteer');
    await action(r._id, 'handover');
    await Donation.updateOne(
      { _id: d._id },
      { $set: { pickupDeadline: new Date(Date.now() - 1) } },
    );
    await expireDonations();
    await inventory(d._id, 6, 4);
    expect((await DonationRequest.findById(r._id)).pickup.status).toBe(
      'picked_up',
    );
    expect((await action(r._id, 'receive', 'ngo')).status).toBe(200);
    await inventory(d._id, 6, 0, 4);
  });
  it('rolls back assignment claim if the shared donation transaction cannot commit', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    vi.spyOn(DonationRequest, 'findOneAndUpdate').mockRejectedValueOnce(
      new Error('injected failure'),
    );
    expect(
      (await call('post', `/api/pickups/${r._id}/claim`, 'volunteer')).status,
    ).toBe(500);
    expect((await DonationRequest.findById(r._id)).pickup.status).toBe(
      'awaiting_volunteer',
    );
    await inventory(d._id, 6, 4);
  });
  it('serializes concurrent claim and NGO cancellation without orphaned active logistics', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    await Promise.all([
      call('post', `/api/pickups/${r._id}/claim`, 'volunteer'),
      action(r._id, 'cancel', 'ngo'),
    ]);
    const closed = await DonationRequest.findById(r._id);
    expect(closed.status).toBe('cancelled');
    expect(closed.pickup.status).toBe('cancelled');
    await inventory(d._id, 10, 0);
  });
  it('rolls back both delivered pickup status and inventory if NGO receipt persistence fails', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    await call('post', `/api/pickups/${r._id}/claim`, 'volunteer');
    await action(r._id, 'handover');
    const failure = vi
      .spyOn(DonationRequest.prototype, 'save')
      .mockRejectedValueOnce(new Error('injected receipt failure'));
    expect((await action(r._id, 'receive', 'ngo')).status).toBe(500);
    const unchanged = await DonationRequest.findById(r._id);
    expect(unchanged.status).toBe('handed_over');
    expect(unchanged.pickup.status).toBe('picked_up');
    await inventory(d._id, 6, 4);
    failure.mockRestore();
    expect((await action(r._id, 'receive', 'ngo')).status).toBe(200);
    await inventory(d._id, 6, 0, 4);
  });
  it('serializes release against donor handover without losing custody or inventory', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    await call('post', `/api/pickups/${r._id}/claim`, 'volunteer');
    await Promise.all([
      pickupAction(r._id, 'volunteer', 'release'),
      action(r._id, 'handover'),
    ]);
    const current = await DonationRequest.findById(r._id);
    expect([
      ['accepted', 'awaiting_volunteer'],
      ['handed_over', 'picked_up'],
    ]).toContainEqual([current.status, current.pickup.status]);
    await inventory(d._id, 6, 4);
  });
  it('hides uncollected precise stops after cutoff while permitting release cleanup', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    await call('post', `/api/pickups/${r._id}/claim`, 'volunteer');
    await Donation.updateOne(
      { _id: d._id },
      { $set: { pickupDeadline: new Date(Date.now() - 1) } },
    );
    expect(
      (await call('get', `/api/pickups/${r._id}`, 'volunteer')).body.assignment
        .locationPrecision,
    ).toBe('approximate');
    expect((await pickupAction(r._id, 'volunteer', 'start')).status).toBe(409);
    expect(
      (await pickupAction(r._id, 'volunteer', 'release')).body.assignment
        .status,
    ).toBe('cancelled');
    await inventory(d._id, 6, 4);
    await expireDonations();
    await inventory(d._id, 10, 0);
  });
});
