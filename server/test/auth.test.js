import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../src/models/User.js';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';
import { cookieName } from '../src/services/sessionService.js';
import {
  redisRestFixture,
  redisFixtureEnvironment,
} from './helpers/redisRestFixture.js';
vi.mock('../src/middleware/databaseReady.js', () => ({
  databaseReady: (_req, _res, next) => next(),
}));
const config = parseEnvironment({
  NODE_ENV: 'test',
  JWT_SECRET: 'isolated-test-secret-that-is-at-least-32-characters',
});
const donor = {
  name: 'Taylor Green',
  email: 'taylor@example.test',
  password: 'a strong test password',
  role: 'donor',
};
let users;
let app;
function mutation(agent, path, body, method = 'post') {
  return agent[method](path)
    .set('Origin', config.CLIENT_ORIGIN)
    .set('X-CSRF-Protection', 'foodbridge')
    .send(body);
}
async function register(agent, input = donor) {
  return mutation(agent, '/api/auth/register', input);
}
beforeEach(() => {
  users = new Map();
  vi.spyOn(User, 'exists').mockImplementation(async (query) =>
    [...users.values()].some((user) => user.email === query.email),
  );
  vi.spyOn(User, 'create').mockImplementation(async (input) => {
    if ([...users.values()].some((user) => user.email === input.email))
      throw Object.assign(new Error('duplicate'), { code: 11000 });
    const user = new User(input);
    await user.validate();
    user.createdAt = new Date();
    user.updatedAt = new Date();
    users.set(String(user._id), user);
    return user;
  });
  vi.spyOn(User, 'findOne').mockImplementation((query) => ({
    select: async () =>
      [...users.values()].find((user) => user.email === query.email) || null,
  }));
  vi.spyOn(User, 'findById').mockImplementation((id) => ({
    select: async () => users.get(String(id)) || null,
  }));
  vi.spyOn(User, 'updateOne').mockImplementation(async (query, update) => {
    const user = users.get(String(query._id));
    if (user) user.tokenVersion += update.$inc.tokenVersion;
    return { matchedCount: user ? 1 : 0 };
  });
  vi.spyOn(User, 'findByIdAndUpdate').mockImplementation(async (id, update) => {
    const user = users.get(String(id));
    if (!user) return null;
    Object.assign(user, update.$set);
    await user.validate();
    return user;
  });
  app = createApp(config);
});
afterEach(() => vi.restoreAllMocks());
describe('authentication and account management', () => {
  it('registers, normalizes email, hashes passwords, and restores a session', async () => {
    const agent = request.agent(app);
    const response = await register(agent, {
      ...donor,
      name: '  Taylor Green  ',
      email: ' TAYLOR@EXAMPLE.TEST ',
    });
    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({
      name: donor.name,
      email: donor.email,
      role: 'donor',
      verificationStatus: 'pending',
    });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.body.user).not.toHaveProperty('tokenVersion');
    const user = [...users.values()][0];
    expect(user.passwordHash).not.toBe(donor.password);
    expect(await bcrypt.compare(donor.password, user.passwordHash)).toBe(true);
    expect(user.toJSON()).not.toHaveProperty('passwordHash');
    const restored = await agent.get('/api/auth/me');
    expect(restored.status).toBe(200);
    expect(restored.body.user.email).toBe(donor.email);
    expect(restored.headers['cache-control']).toBe('no-store');
    expect((await agent.get('/api/users/me')).body.user.id).toBe(
      response.body.user.id,
    );
  });
  it('rejects duplicate email addresses', async () => {
    await register(request(app));
    expect(
      (
        await register(request(app), {
          ...donor,
          email: donor.email.toUpperCase(),
        })
      ).status,
    ).toBe(409);
  });
  it('handles a concurrent unique-index conflict consistently', async () => {
    vi.mocked(User.create).mockRejectedValueOnce(
      Object.assign(new Error('duplicate'), { code: 11000 }),
    );
    const response = await register(request(app));
    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/already exists/);
  });
  it.each(['admin', 'owner'])(
    'rejects public registration as %s',
    async (role) => {
      expect((await register(request(app), { ...donor, role })).status).toBe(
        400,
      );
      expect(User.create).not.toHaveBeenCalled();
    },
  );
  it.each([
    { verificationStatus: 'verified' },
    { passwordHash: 'injected' },
    { tokenVersion: 5 },
  ])('rejects privileged signup fields %j', async (fields) => {
    expect((await register(request(app), { ...donor, ...fields })).status).toBe(
      400,
    );
  });
  it('requires an organization for NGOs and supports volunteer registration', async () => {
    expect(
      (await register(request(app), { ...donor, role: 'ngo' })).status,
    ).toBe(400);
    const ngo = await register(request(app), {
      ...donor,
      role: 'ngo',
      organizationName: 'Campus Care',
    });
    expect(ngo.status).toBe(201);
    expect(ngo.body.user.organizationName).toBe('Campus Care');
    expect(
      (
        await register(request(app), {
          ...donor,
          email: 'volunteer@example.test',
          role: 'volunteer',
        })
      ).status,
    ).toBe(201);
  });
  it.each(['short', '🌱'.repeat(25)])(
    'rejects weak or over-72-byte passwords',
    async (password) => {
      expect(
        (await register(request(app), { ...donor, password })).status,
      ).toBe(400);
    },
  );
  it('rejects malformed input and markup without database writes', async () => {
    expect(
      (await register(request(app), { ...donor, email: { $ne: null } })).status,
    ).toBe(400);
    expect(
      (await register(request(app), { ...donor, name: '<script>bad</script>' }))
        .status,
    ).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });
  it('keeps unexpected database errors private', async () => {
    vi.mocked(User.findOne).mockImplementationOnce(() => {
      throw new Error('private database credentials');
    });
    const response = await mutation(request(app), '/api/auth/login', {
      email: donor.email,
      password: donor.password,
    });
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: { message: 'Internal server error' },
    });
  });
  it('does not accept a password with a matching 72-byte prefix', async () => {
    await register(request(app), { ...donor, password: 'a'.repeat(72) });
    const response = await mutation(request(app), '/api/auth/login', {
      email: donor.email,
      password: 'a'.repeat(72) + 'suffix',
    });
    expect(response.status).toBe(400);
  });
  it('logs in with a valid password and uses a generic invalid-login response', async () => {
    await register(request(app));
    const agent = request.agent(app);
    expect(
      (
        await mutation(agent, '/api/auth/login', {
          email: donor.email,
          password: donor.password,
        })
      ).status,
    ).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    const wrong = await mutation(request(app), '/api/auth/login', {
      email: donor.email,
      password: 'wrong',
    });
    const absent = await mutation(request(app), '/api/auth/login', {
      email: 'unknown@example.test',
      password: 'wrong',
    });
    expect(wrong.status).toBe(401);
    expect(absent.body).toEqual(wrong.body);
    expect(wrong.body.error.message).toBe('Invalid email or password');
  });
  it.each(['/api/auth/me', '/api/users/me', '/api/users/dashboard/admin'])(
    'requires authentication for %s',
    async (path) => {
      expect((await request(app).get(path)).status).toBe(401);
    },
  );
  it('enforces current database roles and rejects other dashboard roles', async () => {
    const agent = request.agent(app);
    await register(agent);
    expect((await agent.get('/api/users/dashboard/donor')).status).toBe(200);
    expect((await agent.get('/api/users/dashboard/admin')).status).toBe(403);
    [...users.values()][0].role = 'admin';
    expect((await agent.get('/api/users/dashboard/admin')).status).toBe(200);
    expect((await agent.get('/api/users/dashboard/donor')).status).toBe(403);
  });
  it('updates safe profile fields', async () => {
    const agent = request.agent(app);
    await register(agent);
    const response = await mutation(
      agent,
      '/api/users/me',
      { name: ' Taylor Updated ', phone: '+91 1234567890' },
      'patch',
    );
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      name: 'Taylor Updated',
      phone: '+91 1234567890',
      role: 'donor',
    });
    expect(response.body.user).not.toHaveProperty('passwordHash');
  });
  it.each([
    'role',
    'verificationStatus',
    'passwordHash',
    'tokenVersion',
    'email',
    '_id',
    '$set',
  ])('rejects profile mass assignment of %s', async (field) => {
    const agent = request.agent(app);
    await register(agent);
    const response = await mutation(
      agent,
      '/api/users/me',
      { name: 'Changed', [field]: 'admin' },
      'patch',
    );
    expect(response.status).toBe(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
  it('clears the cookie and revokes copied tokens on logout', async () => {
    const agent = request.agent(app);
    const registration = await register(agent);
    const copiedCookie = registration.headers['set-cookie'][0].split(';')[0];
    const response = await mutation(agent, '/api/auth/logout', {});
    expect(response.status).toBe(204);
    expect(response.headers['set-cookie'][0]).toMatch(
      /Expires=Thu, 01 Jan 1970/,
    );
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect(
      (await request(app).get('/api/auth/me').set('Cookie', copiedCookie))
        .status,
    ).toBe(401);
  });
  it('rejects expired, tampered, and deleted-user sessions', async () => {
    const agent = request.agent(app);
    const response = await register(agent);
    const user = [...users.values()][0];
    const expired = jwt.sign({ version: 0 }, config.JWT_SECRET, {
      algorithm: 'HS256',
      subject: String(user._id),
      expiresIn: -1,
      issuer: 'foodbridge-api',
      audience: 'foodbridge-client',
    });
    expect(
      (
        await request(app)
          .get('/api/auth/me')
          .set('Cookie', `${cookieName(config)}=${expired}`)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/auth/me')
          .set('Cookie', `${cookieName(config)}=tampered`)
      ).status,
    ).toBe(401);
    users.clear();
    expect(
      (
        await request(app)
          .get('/api/auth/me')
          .set('Cookie', response.headers['set-cookie'][0].split(';')[0])
      ).status,
    ).toBe(401);
  });
});
describe('cookies, CORS, CSRF, and rate limits', () => {
  it('sets HttpOnly, expiry, and SameSite without exposing JWTs in JSON', async () => {
    const response = await register(request(app));
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=86400');
    expect(cookie).not.toContain('Secure');
    expect(response.body).not.toHaveProperty('token');
  });
  it('uses a Secure host-prefixed cookie in production', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(redisRestFixture().fetch);
    const production = createApp({
      ...config,
      ...redisFixtureEnvironment,
      NODE_ENV: 'production',
      COOKIE_SAME_SITE: 'none',
    });
    const response = await register(request(production));
    expect(response.status).toBe(201);
    expect(response.headers['set-cookie'][0]).toMatch(
      /^__Host-foodbridge_session=/,
    );
    expect(response.headers['set-cookie'][0]).toContain('Secure');
    expect(response.headers['set-cookie'][0]).toContain('SameSite=None');
    expect(response.headers['set-cookie'][0]).not.toContain('Domain=');
  });
  it('requires the allowlisted origin and custom header even for login and logout', async () => {
    expect((await request(app).post('/api/auth/login').send({})).status).toBe(
      403,
    );
    expect(
      (
        await request(app)
          .post('/api/auth/register')
          .set('Origin', config.CLIENT_ORIGIN)
          .send(donor)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/auth/register')
          .set('Origin', 'https://evil.test')
          .set('X-CSRF-Protection', 'foodbridge')
          .send(donor)
      ).status,
    ).toBe(403);
    const agent = request.agent(app);
    await register(agent);
    expect(
      (
        await agent
          .post('/api/auth/logout')
          .set('Origin', config.CLIENT_ORIGIN)
          .send({})
      ).status,
    ).toBe(403);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect(
      (
        await agent
          .patch('/api/users/me')
          .set('Origin', config.CLIENT_ORIGIN)
          .send({ name: 'bad' })
      ).status,
    ).toBe(403);
  });
  it('rejects simple form content types', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set('Origin', config.CLIENT_ORIGIN)
      .set('X-CSRF-Protection', 'foodbridge')
      .type('form')
      .send(donor);
    expect(response.status).toBe(403);
  });
  it('allows credentialed preflight only for allowlisted origins', async () => {
    const allowed = await request(app)
      .options('/api/auth/login')
      .set('Origin', config.CLIENT_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-protection');
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      config.CLIENT_ORIGIN,
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const rejected = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://evil.test')
      .set('Access-Control-Request-Method', 'POST');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('rate-limits login and registration separately', async () => {
    const limited = request(
      createApp({ ...config, LOGIN_RATE_LIMIT: 1, REGISTER_RATE_LIMIT: 1 }),
    );
    expect(
      (
        await mutation(limited, '/api/auth/login', {
          email: donor.email,
          password: 'bad',
        })
      ).status,
    ).toBe(401);
    const login = await mutation(limited, '/api/auth/login', {
      email: donor.email,
      password: 'bad',
    });
    expect(login.status).toBe(429);
    expect(login.body.error.message).toMatch(/Too many attempts/);
    expect((await register(limited)).status).toBe(201);
    expect((await register(limited)).status).toBe(429);
  });
});
