import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { createRuntime } from '../src/runtime.js';
import { connectDatabase } from '../src/config/database.js';
import { createLogger } from '../src/utils/logger.js';
import {
  redisRestFixture,
  redisFixtureEnvironment,
} from './helpers/redisRestFixture.js';
vi.mock('../src/middleware/databaseReady.js', () => ({
  databaseReady: (_req, _res, next) => next(),
}));
vi.mock('../src/config/database.js', () => ({ connectDatabase: vi.fn() }));
const base = {
  ...redisFixtureEnvironment,
  NODE_ENV: 'production',
  VERCEL: '1',
  CLIENT_IP_SOURCE: 'vercel',
  CLIENT_ORIGIN: 'https://foodbridge.example.test',
  JWT_SECRET: 'isolated-vercel-fixture-secret-at-least-32-characters',
  LOGIN_RATE_LIMIT: '2',
  REGISTER_RATE_LIMIT: '2',
};
const config = (overrides = {}) => parseEnvironment({ ...base, ...overrides });
const logger = createLogger({ write: () => {} });
const runtimes = [];
function attempt(app, endpoint, headers = {}) {
  return request(app)
    .post(`/api/auth/${endpoint}`)
    .set('Origin', base.CLIENT_ORIGIN)
    .set('X-CSRF-Protection', 'foodbridge')
    .set(headers)
    .send({});
}
beforeEach(() => {
  vi.mocked(connectDatabase).mockResolvedValue(false);
  vi.stubGlobal('fetch', vi.fn(redisRestFixture().fetch));
});
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('Vercel client identity boundary', () => {
  it.each([
    { VERCEL: '0' },
    { NODE_ENV: 'development' },
    { TRUSTED_PROXY_CIDRS: '127.0.0.1/32' },
    { RENDER: 'true' },
  ])(
    'refuses Vercel identity outside an exclusive production platform configuration: %j',
    (overrides) => {
      expect(() => config(overrides)).toThrow('exclusive production Vercel');
    },
  );
  it.each(['login', 'register'])(
    'ignores forged XFF prefixes and keeps independent real clients for %s',
    async (endpoint) => {
      const app = createApp(config(), { logger });
      expect(app.get('trust proxy')).toBe(false);
      for (const n of [1, 2, 3]) {
        const response = await attempt(app, endpoint, {
          'X-Vercel-Forwarded-For': '203.0.113.10',
          'X-Forwarded-For': `192.0.2.${n}`,
          'X-Real-IP': `192.0.2.${n}`,
          Forwarded: `for=192.0.2.${n}`,
        });
        expect(response.status).toBe(n === 3 ? 429 : 400);
      }
      expect(
        (
          await attempt(app, endpoint, {
            'X-Vercel-Forwarded-For': '203.0.113.11',
          })
        ).status,
      ).toBe(400);
    },
  );
  it('puts missing, malformed, and multi-value platform headers in one restrictive bucket', async () => {
    const app = createApp(config(), { logger });
    expect((await attempt(app, 'login')).status).toBe(400);
    expect(
      (await attempt(app, 'login', { 'X-Vercel-Forwarded-For': 'invalid' }))
        .status,
    ).toBe(400);
    expect(
      (
        await attempt(app, 'login', {
          'X-Vercel-Forwarded-For': '203.0.113.1, 203.0.113.2',
        })
      ).status,
    ).toBe(429);
  });
  it('groups Vercel IPv6 rotations within the same /56', async () => {
    const app = createApp(config(), { logger });
    for (const n of [1, 2, 3])
      expect(
        (
          await attempt(app, 'login', {
            'X-Vercel-Forwarded-For': `2001:db8:abcd:1200::${n}`,
          })
        ).status,
      ).toBe(n === 3 ? 429 : 400);
  });
  it('ignores caller-supplied platform headers in the local runtime', async () => {
    const app = createApp(
      config({ NODE_ENV: 'test', VERCEL: '0', CLIENT_IP_SOURCE: 'express' }),
      { logger },
    );
    for (const n of [1, 2, 3])
      expect(
        (
          await attempt(app, 'login', {
            'X-Vercel-Forwarded-For': `203.0.113.${n}`,
            'X-Forwarded-For': `203.0.113.${n}`,
            Vercel: '1',
          })
        ).status,
      ).toBe(n === 3 ? 429 : 400);
  });
});
describe('shared runtime authentication and API contract', () => {
  it('serves API paths and queries as JSON, including JSON 404s, without listening on import', async () => {
    const runtime = await createRuntime(config(), { logger });
    runtimes.push(runtime);
    expect(runtime.server.listening).toBe(false);
    expect(runtime.app.get('io')).toBeDefined();
    expect(runtime.server.listenerCount('upgrade')).toBeGreaterThan(0);
    expect(
      (await request(runtime.server).get('/api/health?probe=1')).body.status,
    ).toBe('ok');
    const missing = await request(runtime.server).get('/api/not-a-route');
    expect(missing.status).toBe(404);
    expect(missing.type).toBe('application/json');
  });
  it('initializes both persistent notification and image-cleanup workers in Render demo mode', async () => {
    const intervals = vi.spyOn(globalThis, 'setInterval');
    const runtime = await createRuntime(
      config({
        VERCEL: '0',
        RENDER: 'true',
        CLIENT_IP_SOURCE: 'socket',
        RATE_LIMIT_STORE: 'process-demo',
        DEMO_SINGLE_PROCESS: 'true',
        UPSTASH_REDIS_REST_URL: '',
        UPSTASH_REDIS_REST_TOKEN: '',
        CLOUDINARY_CLOUD_NAME: 'isolated-worker-fixture',
        CLOUDINARY_API_KEY: 'isolated-fixture-key',
        CLOUDINARY_API_SECRET: 'isolated-fixture-secret',
      }),
      { logger },
    );
    runtimes.push(runtime);
    expect(intervals.mock.calls.map(([, ms]) => ms)).toEqual(
      expect.arrayContaining([2000, 60000]),
    );
    expect(runtime.app.get('io')).toBeDefined();
    expect(runtime.server.listenerCount('upgrade')).toBeGreaterThan(0);
  });
  it('retains secure same-origin login, session restoration, role restrictions, CSRF and logout revocation', async () => {
    const runtime = await createRuntime(config(), { logger });
    runtimes.push(runtime);
    const user = new User({
      name: 'Demo Donor',
      email: 'donor@example.test',
      role: 'donor',
      passwordHash: await bcrypt.hash('isolated demo password', 4),
    });
    vi.spyOn(User, 'findOne').mockReturnValue({ select: async () => user });
    vi.spyOn(User, 'findById').mockReturnValue({ select: async () => user });
    vi.spyOn(User, 'updateOne').mockImplementation(async () => {
      user.tokenVersion++;
      return { matchedCount: 1 };
    });
    const server = runtime.server;
    expect((await request(server).get('/api/auth/me')).status).toBe(401);
    const login = await request(server)
      .post('/api/auth/login')
      .set('Origin', base.CLIENT_ORIGIN)
      .set('X-CSRF-Protection', 'foodbridge')
      .set('X-Vercel-Forwarded-For', '203.0.113.10')
      .send({ email: user.email, password: 'isolated demo password' });
    expect(login.status).toBe(200);
    const cookie = login.headers['set-cookie'][0];
    expect(cookie).toMatch(/^__Host-foodbridge_session=/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Domain=');
    const session = cookie.split(';')[0];
    const restored = await request(server)
      .get('/api/auth/me')
      .set('Cookie', session);
    expect(restored.status).toBe(200);
    expect(restored.body.user.id).toBe(String(user._id));
    expect(
      (
        await request(server)
          .get('/api/users/dashboard/admin')
          .set('Cookie', session)
      ).status,
    ).toBe(403);
    for (const headers of [
      { Origin: base.CLIENT_ORIGIN },
      {
        Origin: 'https://other.example.test',
        'X-CSRF-Protection': 'foodbridge',
      },
    ])
      expect(
        (
          await request(server)
            .post('/api/auth/logout')
            .set('Cookie', session)
            .set(headers)
            .send({})
        ).status,
      ).toBe(403);
    expect(
      (
        await request(server)
          .post('/api/auth/logout')
          .set('Cookie', session)
          .set('Origin', base.CLIENT_ORIGIN)
          .set('X-CSRF-Protection', 'foodbridge')
          .send({})
      ).status,
    ).toBe(204);
    expect(
      (await request(server).get('/api/auth/me').set('Cookie', session)).status,
    ).toBe(401);
    expect(
      (
        await request(server)
          .get('/api/auth/me')
          .set('Cookie', '__Host-foodbridge_session=invalid')
      ).status,
    ).toBe(401);
  });
});
