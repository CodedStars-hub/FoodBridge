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
import { Notification } from '../src/models/Notification.js';
import { ImageCleanupTask } from '../src/models/ImageCleanupTask.js';
import { persistNotification } from '../src/services/notificationService.js';
import {
  dispatchNotifications,
  attachRealtime,
} from '../src/services/realtimeService.js';
import { createServer } from 'node:http';
import { io as connectSocket } from 'socket.io-client';
import sharp from 'sharp';
import * as cloudClient from '../src/services/cloudinaryClient.js';
import { cleanupImages } from '../src/services/imageService.js';
vi.mock('../src/services/cloudinaryClient.js', async (original) => ({
  ...(await original()),
  uploadCloudImage: vi.fn(),
  destroyCloudImage: vi.fn(),
}));
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
  await Promise.all([
    User.init(),
    Donation.init(),
    DonationRequest.init(),
    Notification.init(),
    ImageCleanupTask.init(),
  ]);
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
    Notification.deleteMany({}),
    ImageCleanupTask.deleteMany({}),
  ]);
  const inputs = [
    ['donor', 'donor', 'pending'],
    ['admin', 'admin', 'verified'],
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
function call(method, path, actor = 'donor', body, application = app) {
  let req = request(application)[method](path);
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

const yearlyRange = () => {
  const year = new Date().getUTCFullYear();
  return `from=${year}-01-01&to=${year}-12-31`;
};
async function receipt({
  quantity = 10,
  unit = 'servings',
  requested = 4,
} = {}) {
  const d = await donation({ quantity, unit });
  const r = await pending(d._id, 'ngo', requested);
  await action(r._id, 'accept');
  await action(r._id, 'handover');
  await action(r._id, 'receive', 'ngo');
  return { d, r };
}
describe('role analytics from MongoDB aggregations', () => {
  it('groups confirmed redistributed quantities by unit and excludes merely accepted food', async () => {
    await receipt();
    await receipt({ unit: 'kg', requested: 3 });
    const awaiting = await donation();
    const r = await pending(awaiting._id);
    await action(r._id, 'accept');
    const result = await call('get', `/api/analytics/donor?${yearlyRange()}`);
    expect(result.status).toBe(200);
    expect(result.body.summary.totalDonations).toBe(3);
    expect(result.body.summary.completedReceipts).toBe(2);
    expect(result.body.quantitiesByUnit).toEqual([
      { unit: 'kg', quantity: 3, receipts: 1 },
      { unit: 'servings', quantity: 4, receipts: 1 },
    ]);
    expect(result.body.summary).not.toHaveProperty('totalQuantity');
    expect(
      (await call('get', `/api/analytics/donor?${yearlyRange()}`, 'other')).body
        .quantitiesByUnit,
    ).toEqual([]);
  });
  it('scopes NGO counts and receipt totals to the authenticated account', async () => {
    await receipt();
    const d = await donation();
    const r = await pending(d._id);
    await action(r._id, 'accept');
    await donation();
    const result = await call(
      'get',
      `/api/analytics/ngo?${yearlyRange()}`,
      'ngo',
    );
    expect(result.status).toBe(200);
    expect(result.body.summary).toMatchObject({
      totalRequests: 2,
      acceptedRequests: 1,
      completedReceipts: 1,
    });
    expect(result.body.quantitiesByUnit[0].quantity).toBe(4);
    expect(
      (await call('get', `/api/analytics/ngo?${yearlyRange()}`, 'second')).body
        .summary.totalRequests,
    ).toBe(0);
  });
  it('computes admin user roles, current availability and listing completion rate without counting expiry as completion', async () => {
    await receipt({ quantity: 4, requested: 4 });
    await donation();
    const expired = await donation();
    await Donation.updateOne(
      { _id: expired._id },
      { $set: { pickupDeadline: new Date(Date.now() - 1) } },
    );
    const cancelled = await donation();
    await call('post', `/api/donations/${cancelled._id}/cancel`);
    const result = await call(
      'get',
      `/api/analytics/admin?${yearlyRange()}`,
      'admin',
    );
    expect(result.status).toBe(200);
    expect(result.body.summary).toMatchObject({
      totalDonations: 4,
      completedDonations: 1,
      activeDonations: 1,
      completionRate: 25,
      totalUsers: 7,
    });
    expect(
      result.body.usersByRole.find((row) => row.role === 'ngo').count,
    ).toBe(3);
    expect(result.body.monthly.reduce((sum, row) => sum + row.users, 0)).toBe(
      7,
    );
  });
  it('uses receipt time independently of listing creation time and returns monthly UTC buckets', async () => {
    const { d, r } = await receipt();
    const year = new Date().getUTCFullYear();
    await Donation.updateOne(
      { _id: d._id },
      { $set: { createdAt: new Date(`${year}-01-15T12:00:00Z`) } },
    );
    await DonationRequest.updateOne(
      { _id: r._id },
      { $set: { receivedAt: new Date(`${year}-03-02T12:00:00Z`) } },
    );
    const march = await call(
      'get',
      `/api/analytics/donor?from=${year}-03-01&to=${year}-03-31`,
    );
    expect(march.body.summary.totalDonations).toBe(0);
    expect(march.body.summary.completedReceipts).toBe(1);
    expect(march.body.monthly).toHaveLength(1);
    expect(march.body.monthly[0].receipts).toBe(1);
  });
  it('labels the legacy timestamp fallback and does not invent a receipt date', async () => {
    const { r } = await receipt();
    await DonationRequest.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(r._id) },
      { $unset: { receivedAt: 1 } },
    );
    const result = await call(
      'get',
      `/api/analytics/ngo?${yearlyRange()}`,
      'ngo',
    );
    expect(result.body.legacyReceiptTimestamps).toBe(1);
    expect(result.body.notes.join(' ')).toContain('older completed');
  });
  it('enforces role authorization and rejects user overrides and invalid date ranges', async () => {
    expect((await call('get', '/api/analytics/admin', 'donor')).status).toBe(
      403,
    );
    expect((await call('get', '/api/analytics/donor', null)).status).toBe(401);
    expect(
      (await call('get', '/api/analytics/donor?userId=other')).status,
    ).toBe(400);
    for (const query of [
      'from=invalid',
      'from=2026-09-01&to=2026-01-01',
      'from=2000-01-01&to=2026-01-01',
    ])
      expect((await call('get', `/api/analytics/donor?${query}`)).status).toBe(
        400,
      );
  });
  it('counts volunteer active custody, available pools and completion only after NGO receipt', async () => {
    const { d, r } = await preparedPickup();
    await eligibleVolunteers();
    const before = await call(
      'get',
      `/api/analytics/volunteer?${yearlyRange()}`,
      'volunteer',
    );
    expect(before.body.summary.availableAssignments).toBe(1);
    await call('post', `/api/pickups/${r._id}/claim`, 'volunteer');
    await action(r._id, 'handover');
    await Donation.updateOne(
      { _id: d._id },
      { $set: { pickupDeadline: new Date(Date.now() - 1) } },
    );
    const held = await call(
      'get',
      `/api/analytics/volunteer?${yearlyRange()}`,
      'volunteer',
    );
    expect(held.body.summary).toMatchObject({
      availableAssignments: 0,
      activeAssignments: 1,
      completedPickups: 0,
    });
    await action(r._id, 'receive', 'ngo');
    const done = await call(
      'get',
      `/api/analytics/volunteer?${yearlyRange()}`,
      'volunteer',
    );
    expect(done.body.summary).toMatchObject({
      activeAssignments: 0,
      completedPickups: 1,
    });
    expect(done.body.pickupHistory[0]).not.toHaveProperty('origin');
  });
  it('does not credit a released volunteer for another volunteer’s completed delivery', async () => {
    const { r } = await preparedPickup();
    await eligibleVolunteers();
    await call('post', `/api/pickups/${r._id}/claim`, 'volunteer');
    await pickupAction(r._id, 'volunteer', 'release');
    await call('post', `/api/pickups/${r._id}/claim`, 'courier');
    await action(r._id, 'handover');
    await action(r._id, 'receive', 'ngo');
    const previous = await call(
      'get',
      `/api/analytics/volunteer?${yearlyRange()}`,
      'volunteer',
    );
    expect(previous.body.summary.completedPickups).toBe(0);
    expect(previous.body.pickupHistory).toHaveLength(1);
    expect(previous.body.pickupHistory[0].assignedToMe).toBe(false);
    expect(
      (
        await call(
          'get',
          `/api/analytics/volunteer?${yearlyRange()}`,
          'courier',
        )
      ).body.summary.completedPickups,
    ).toBe(1);
  });
  it('returns actual zero counts and no fabricated sample activity for empty ranges', async () => {
    const result = await call(
      'get',
      '/api/analytics/admin?from=2020-01-01&to=2020-02-29',
      'admin',
    );
    expect(result.body.summary.totalDonations).toBe(0);
    expect(result.body.summary.completionRate).toBe(0);
    expect(result.body.quantitiesByUnit).toEqual([]);
    expect(result.body.monthly.map((row) => row.donations)).toEqual([0, 0]);
  });
});
describe('persistent notifications and transactional outbox', () => {
  it('persists recipient-scoped request, acceptance, handover and receipt notifications', async () => {
    const d = await donation();
    const r = await pending(d._id);
    let donorInbox = await call('get', '/api/notifications', 'donor');
    expect(donorInbox.body.unreadCount).toBe(1);
    expect(donorInbox.body.items[0].type).toBe('request_created');
    expect(
      (await call('get', '/api/notifications', 'other')).body.items,
    ).toEqual([]);
    await action(r._id, 'accept');
    expect(
      (await call('get', '/api/notifications', 'ngo')).body.items.some(
        (row) => row.type === 'request_accepted',
      ),
    ).toBe(true);
    await action(r._id, 'handover');
    await action(r._id, 'receive', 'ngo');
    donorInbox = await call('get', '/api/notifications', 'donor');
    expect(
      donorInbox.body.items.some((row) => row.type === 'receipt_confirmed'),
    ).toBe(true);
    expect(donorInbox.body.items[0]).not.toHaveProperty('recipient');
    expect(JSON.stringify(donorInbox.body)).not.toContain('pickupLocation');
  });
  it('idempotently stores the same event without resetting its read state', async () => {
    const value = {
      recipient: actors.donor._id,
      eventKey: 'retry-safe-event',
      type: 'request_created',
      message: 'A donor-visible request',
    };
    await persistNotification(value);
    const original = await Notification.findOne({ eventKey: value.eventKey });
    original.readAt = new Date();
    await original.save();
    await persistNotification(value);
    expect(
      await Notification.countDocuments({ eventKey: value.eventKey }),
    ).toBe(1);
    expect(
      (await Notification.findOne({ eventKey: value.eventKey })).readAt,
    ).not.toBeNull();
  });
  it('prevents reading another account’s notifications and supports read-all/unread counts', async () => {
    const d = await donation();
    await pending(d._id);
    const inbox = await call('get', '/api/notifications', 'donor');
    const id = inbox.body.items[0].id;
    expect(
      (await call('patch', `/api/notifications/${id}/read`, 'ngo')).status,
    ).toBe(404);
    expect(
      (await call('patch', `/api/notifications/${id}/read`, 'donor')).status,
    ).toBe(200);
    expect(
      (await call('patch', `/api/notifications/${id}/read`, 'donor')).status,
    ).toBe(200);
    expect(
      (await call('get', '/api/notifications?unread=true', 'donor')).body.items,
    ).toEqual([]);
    await pending(d._id, 'second');
    expect(
      (await call('patch', '/api/notifications/read-all', 'donor')).body
        .unreadCount,
    ).toBe(0);
    expect(
      (await call('get', '/api/notifications', 'donor')).body.unreadCount,
    ).toBe(0);
    expect(
      (await call('get', '/api/notifications?recipient=other', 'donor')).status,
    ).toBe(400);
  });
  it('rolls back notification rows with a failed business transaction', async () => {
    const d = await donation();
    vi.spyOn(Notification, 'updateOne').mockRejectedValueOnce(
      new Error('injected outbox storage failure'),
    );
    expect((await submit(d._id)).status).toBe(500);
    expect(await DonationRequest.countDocuments()).toBe(0);
    expect(await Notification.countDocuments()).toBe(0);
    await inventory(d._id, 10, 0);
  });
  it('keeps receipt and inventory committed when socket delivery fails, then retries', async () => {
    const { d, r } = await receipt();
    const pendingCount = await Notification.countDocuments({
      broadcastAt: null,
    });
    const failing = {
      in: () => ({ fetchSockets: async () => [] }),
      to: () => ({
        emit: () => {
          throw new Error('transport unavailable');
        },
      }),
    };
    expect(await dispatchNotifications(failing)).toBe(0);
    expect(await Notification.countDocuments({ broadcastAt: null })).toBe(
      pendingCount,
    );
    expect((await DonationRequest.findById(r._id)).status).toBe('completed');
    await inventory(d._id, 6, 0, 4);
    const healthy = {
      in: () => ({ fetchSockets: async () => [] }),
      to: () => ({ emit: vi.fn() }),
    };
    expect(await dispatchNotifications(healthy)).toBe(pendingCount);
    expect(await Notification.countDocuments({ broadcastAt: null })).toBe(0);
  });
  it('does not duplicate events when an invalid repeated transition is retried', async () => {
    const d = await donation();
    const r = await pending(d._id);
    await action(r._id, 'accept');
    const count = await Notification.countDocuments();
    expect((await action(r._id, 'accept')).status).toBe(409);
    expect(await Notification.countDocuments()).toBe(count);
  });
  it('notifies affected NGOs on donation cancellation and volunteer claims/status changes', async () => {
    const d = await donation();
    await pending(d._id);
    await call('post', `/api/donations/${d._id}/cancel`);
    expect(
      (await call('get', '/api/notifications', 'ngo')).body.items.some(
        (row) => row.type === 'donation_cancelled',
      ),
    ).toBe(true);
    const setup = await preparedPickup();
    await eligibleVolunteers();
    await call('post', `/api/pickups/${setup.r._id}/claim`, 'volunteer');
    expect(
      (await call('get', '/api/notifications', 'donor')).body.items.some(
        (row) => row.type === 'volunteer_claimed',
      ),
    ).toBe(true);
    await pickupAction(setup.r._id, 'volunteer', 'start');
    expect(
      (await call('get', '/api/notifications', 'ngo')).body.items.some(
        (row) => row.type === 'pickup_status_changed',
      ),
    ).toBe(true);
  });
});
let socketRuntime;
const socketClients = [];
afterEach(async () => {
  for (const client of socketClients.splice(0)) client.disconnect();
  if (socketRuntime) {
    await socketRuntime.close();
    socketRuntime = null;
  }
});
async function socketServer() {
  const server = createServer(app);
  socketRuntime = attachRealtime(server, app, config, { poll: false });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
function actorCookie(actor, expiresIn = 3600, version = 0) {
  return `foodbridge_session=${jwt.sign({ version }, config.JWT_SECRET, { subject: String(actors[actor]._id), expiresIn, issuer: 'foodbridge-api', audience: 'foodbridge-client', algorithm: 'HS256' })}`;
}
function socketClient(url, actor, extra = {}) {
  const client = connectSocket(url, {
    transports: ['websocket'],
    reconnection: false,
    autoConnect: false,
    extraHeaders: {
      Origin: config.CLIENT_ORIGIN,
      ...(actor ? { Cookie: actorCookie(actor) } : {}),
      ...extra,
    },
  });
  socketClients.push(client);
  return client;
}
async function connects(client) {
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
    client.connect();
  });
}
describe('Socket.IO authentication, authorization and reconnect', () => {
  it('joins only the cookie-authenticated user room and ignores client-selected rooms', async () => {
    const url = await socketServer();
    const client = socketClient(url, 'donor');
    await connects(client);
    client.emit('join', `user:${actors.ngo._id}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const serverSocket = [...socketRuntime.io.sockets.sockets.values()][0];
    expect(serverSocket.rooms.has(`user:${actors.donor._id}`)).toBe(true);
    expect(serverSocket.rooms.has(`user:${actors.ngo._id}`)).toBe(false);
  });
  it('rejects missing, forged, expired, revoked and wrong-origin connections', async () => {
    const url = await socketServer();
    const attempts = [
      socketClient(url, null),
      socketClient(url, null, { Cookie: 'foodbridge_session=forged' }),
      socketClient(url, null, { Cookie: actorCookie('donor', -1) }),
      socketClient(url, null, { Cookie: actorCookie('donor', 3600, 99) }),
      socketClient(url, 'donor', { Origin: 'https://foreign.example.test' }),
    ];
    for (const client of attempts) {
      const error = await new Promise((resolve) => {
        client.once('connect_error', resolve);
        client.connect();
      });
      expect(error).toBeInstanceOf(Error);
      expect(client.connected).toBe(false);
    }
  });
  it('delivers only to the recipient and retains a reconnectable durable inbox', async () => {
    const url = await socketServer();
    const donor = socketClient(url, 'donor'),
      ngo = socketClient(url, 'ngo');
    await connects(donor);
    await connects(ngo);
    let receivedByOther = 0;
    ngo.on('notifications:changed', () => receivedByOther++);
    await persistNotification({
      recipient: actors.donor._id,
      eventKey: 'socket-recipient',
      type: 'request_created',
      message: 'Request available',
    });
    const delivered = new Promise((resolve) =>
      donor.once('notifications:changed', resolve),
    );
    await dispatchNotifications(socketRuntime.io);
    await delivered;
    expect(receivedByOther).toBe(0);
    donor.disconnect();
    await persistNotification({
      recipient: actors.donor._id,
      eventKey: 'offline-event',
      type: 'request_created',
      message: 'Offline update',
    });
    await dispatchNotifications(socketRuntime.io);
    const again = socketClient(url, 'donor');
    await connects(again);
    expect(
      (await call('get', '/api/notifications', 'donor')).body.unreadCount,
    ).toBe(2);
  });
  it('disconnects live sockets on logout and rejects the copied old cookie', async () => {
    const url = await socketServer();
    const client = socketClient(url, 'donor');
    await connects(client);
    const disconnected = new Promise((resolve) =>
      client.once('disconnect', resolve),
    );
    expect((await call('post', '/api/auth/logout', 'donor')).status).toBe(204);
    await disconnected;
    expect(client.connected).toBe(false);
    const stale = socketClient(url, 'donor');
    const error = await new Promise((resolve) => {
      stale.once('connect_error', resolve);
      stale.connect();
    });
    expect(error).toBeInstanceOf(Error);
  });
});
const imageConfig = {
  ...config,
  CLOUDINARY_CLOUD_NAME: 'isolated-test-cloud',
  CLOUDINARY_API_KEY: 'isolated-test-key',
  CLOUDINARY_API_SECRET: 'isolated-test-secret',
};
const imageApp = createApp(imageConfig);
async function png() {
  return sharp({
    create: { width: 4, height: 4, channels: 3, background: '#317448' },
  })
    .png()
    .toBuffer();
}
function configureImageProvider() {
  vi.mocked(cloudClient.uploadCloudImage).mockImplementation(
    async (buffer, publicId) => {
      const metadata = await sharp(buffer).metadata();
      return {
        public_id: publicId,
        secure_url: `https://res.cloudinary.com/isolated-test-cloud/image/upload/${publicId}.webp`,
        format: 'webp',
        bytes: buffer.length,
        width: metadata.width,
        height: metadata.height,
      };
    },
  );
  vi.mocked(cloudClient.destroyCloudImage).mockResolvedValue({ result: 'ok' });
}
function imageRequest(
  id,
  {
    actor = 'donor',
    buffer,
    mime = 'image/png',
    application = imageApp,
    csrf = true,
    method = 'post',
  } = {},
) {
  const agent = request(application);
  let req = agent[method](`/api/donations/${id}/image`).set(
    'Origin',
    config.CLIENT_ORIGIN,
  );
  if (actor) req = req.set('Cookie', actorCookie(actor));
  if (csrf) req = req.set('X-CSRF-Protection', 'foodbridge');
  return method === 'post'
    ? req.attach('file', buffer, { filename: 'food.png', contentType: mime })
    : req.send({});
}
describe('authenticated managed image uploads with isolated Cloudinary adapter', () => {
  it('validates, re-encodes and stores image metadata and public ID without changing inventory', async () => {
    configureImageProvider();
    const d = await donation();
    const result = await imageRequest(d._id, { buffer: await png() });
    expect(result.status).toBe(200);
    expect(result.body.image).toMatchObject({
      format: 'webp',
      width: 4,
      height: 4,
    });
    expect(result.body.image.publicId).toMatch(
      new RegExp(`^foodbridge/donations/${d._id}/`),
    );
    await inventory(d._id, 10, 0);
    expect((await Donation.findById(d._id)).image.secureUrl).toBe(
      result.body.image.secureUrl,
    );
  });
  it('preserves backward compatibility for records without an image revision', async () => {
    configureImageProvider();
    const d = await donation();
    await Donation.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(d._id) },
      { $unset: { imageVersion: 1 } },
    );
    expect((await imageRequest(d._id, { buffer: await png() })).status).toBe(
      200,
    );
  });
  it('rejects unauthorized, wrong-role, non-owner and CSRF-less image changes', async () => {
    configureImageProvider();
    const d = await donation();
    const buffer = await png();
    for (const [actor, status] of [
      [null, 401],
      ['ngo', 403],
      ['other', 403],
    ])
      expect((await imageRequest(d._id, { actor, buffer })).status).toBe(
        status,
      );
    expect((await imageRequest(d._id, { buffer, csrf: false })).status).toBe(
      403,
    );
    expect(cloudClient.uploadCloudImage).not.toHaveBeenCalled();
  });
  it('rejects MIME/signature mismatches, SVG, forged PNG headers and oversize images', async () => {
    configureImageProvider();
    const d = await donation();
    expect(
      (await imageRequest(d._id, { buffer: await png(), mime: 'image/jpeg' }))
        .status,
    ).toBe(415);
    expect(
      (
        await imageRequest(d._id, {
          buffer: Buffer.from('<svg/>'),
          mime: 'image/svg+xml',
        })
      ).status,
    ).toBe(415);
    expect([400, 415]).toContain(
      (
        await imageRequest(d._id, {
          buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        })
      ).status,
    );
    expect(
      (await imageRequest(d._id, { buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }))
        .status,
    ).toBe(413);
    expect(cloudClient.uploadCloudImage).not.toHaveBeenCalled();
  });
  it('gracefully disables uploads when Cloudinary is missing and exposes no secrets', async () => {
    configureImageProvider();
    const d = await donation();
    const result = await imageRequest(d._id, {
      buffer: await png(),
      application: app,
    });
    expect(result.status).toBe(503);
    const details = await call('get', `/api/donations/${d._id}`);
    expect(details.body.imageUpload.enabled).toBe(false);
    expect(JSON.stringify(details.body)).not.toContain('CLOUDINARY_API_SECRET');
    expect(cloudClient.uploadCloudImage).not.toHaveBeenCalled();
  });
  it('preserves an existing image and inventory when Cloudinary upload fails', async () => {
    configureImageProvider();
    const d = await donation();
    const first = await imageRequest(d._id, { buffer: await png() });
    vi.mocked(cloudClient.uploadCloudImage).mockRejectedValueOnce(
      new Error('provider credentials must stay private'),
    );
    const failed = await imageRequest(d._id, { buffer: await png() });
    expect(failed.status).toBe(502);
    expect(JSON.stringify(failed.body)).not.toContain('credentials');
    expect((await Donation.findById(d._id)).image.publicId).toBe(
      first.body.image.publicId,
    );
    await inventory(d._id, 10, 0);
  });
  it('replaces images and deletes only the prior server-owned asset', async () => {
    configureImageProvider();
    const d = await donation();
    const first = await imageRequest(d._id, { buffer: await png() });
    const second = await imageRequest(d._id, { buffer: await png() });
    expect(second.status).toBe(200);
    expect(second.body.image.publicId).not.toBe(first.body.image.publicId);
    expect(cloudClient.destroyCloudImage).toHaveBeenCalledWith(
      first.body.image.publicId,
      imageConfig,
    );
    expect((await Donation.findById(d._id)).image.publicId).toBe(
      second.body.image.publicId,
    );
  });
  it('queues failed deletion, prevents non-owner deletion and retries cleanup idempotently', async () => {
    configureImageProvider();
    const d = await donation();
    const saved = await imageRequest(d._id, { buffer: await png() });
    expect(
      (await imageRequest(d._id, { actor: 'other', method: 'delete' })).status,
    ).toBe(403);
    vi.mocked(cloudClient.destroyCloudImage).mockRejectedValueOnce(
      new Error('temporary delete failure'),
    );
    const removed = await imageRequest(d._id, { method: 'delete' });
    expect(removed.status).toBe(200);
    expect(removed.body.cleanupPending).toBe(true);
    expect((await Donation.findById(d._id)).image).toBeUndefined();
    expect(
      await ImageCleanupTask.exists({ publicId: saved.body.image.publicId }),
    ).not.toBeNull();
    await ImageCleanupTask.updateMany(
      {},
      { $set: { readyAfter: new Date(0) } },
    );
    await cleanupImages(imageConfig);
    expect(await ImageCleanupTask.countDocuments()).toBe(0);
    expect((await cleanupImages(imageConfig)).removed).toBe(0);
  });
  it('never deletes a cloud asset still referenced by a donation', async () => {
    configureImageProvider();
    const d = await donation();
    const saved = await imageRequest(d._id, { buffer: await png() });
    vi.mocked(cloudClient.destroyCloudImage).mockClear();
    await ImageCleanupTask.create({
      publicId: saved.body.image.publicId,
      readyAfter: new Date(0),
    });
    await cleanupImages(imageConfig);
    expect(cloudClient.destroyCloudImage).not.toHaveBeenCalled();
    expect((await Donation.findById(d._id)).image.publicId).toBe(
      saved.body.image.publicId,
    );
  });
  it('does not let a normal listing PATCH orphan a managed cloud image', async () => {
    configureImageProvider();
    const d = await donation();
    await imageRequest(d._id, { buffer: await png() });
    expect(
      (
        await call('patch', `/api/donations/${d._id}`, 'donor', {
          imageUrl: 'https://example.test/other.jpg',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call('patch', `/api/donations/${d._id}`, 'donor', {
          image: { publicId: 'someone-else' },
        })
      ).status,
    ).toBe(400);
  });
  it('atomically resolves concurrent image replacements and cleans only the losing upload', async () => {
    configureImageProvider();
    const normal = vi
      .mocked(cloudClient.uploadCloudImage)
      .getMockImplementation();
    let arrivals = 0;
    let release;
    const barrier = new Promise((resolve) => {
      release = resolve;
    });
    vi.mocked(cloudClient.uploadCloudImage).mockImplementation(
      async (...args) => {
        arrivals++;
        if (arrivals === 2) release();
        await barrier;
        return normal(...args);
      },
    );
    const d = await donation();
    const bytes = await png();
    const results = await Promise.all([
      imageRequest(d._id, { buffer: bytes }),
      imageRequest(d._id, { buffer: bytes }),
    ]);
    expect(results.map((row) => row.status).sort()).toEqual([200, 409]);
    const current = await Donation.findById(d._id);
    const winner = results.find((row) => row.status === 200);
    expect(current.image.publicId).toBe(winner.body.image.publicId);
    expect(
      cloudClient.destroyCloudImage.mock.calls.some(
        ([publicId]) => publicId === winner.body.image.publicId,
      ),
    ).toBe(false);
    await inventory(d._id, 10, 0);
  });
});
