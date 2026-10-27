import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { parseEnvironment } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { clientAddress } from '../src/config/proxy.js';
import { createLogger } from '../src/utils/logger.js';
vi.mock('../src/middleware/databaseReady.js', () => ({
  databaseReady: (_req, _res, next) => next(),
}));
const base = {
  NODE_ENV: 'production',
  RENDER: 'true',
  VERCEL: '0',
  CLIENT_ORIGIN: 'https://foodbridge-demo.vercel.app',
  CLIENT_IP_SOURCE: 'socket',
  RATE_LIMIT_STORE: 'process-demo',
  DEMO_SINGLE_PROCESS: 'true',
  COOKIE_SAME_SITE: 'none',
  JWT_SECRET: 'isolated-render-demo-fixture-at-least-32-characters',
  LOGIN_RATE_LIMIT: '2',
  REGISTER_RATE_LIMIT: '2',
};
const config = (extra = {}) => parseEnvironment({ ...base, ...extra });
const logger = createLogger({ write: () => {} });
afterEach(() => vi.restoreAllMocks());
function attempt(app, endpoint, n) {
  return request(app)
    .post(`/api/auth/${endpoint}`)
    .set('Origin', base.CLIENT_ORIGIN)
    .set('X-CSRF-Protection', 'foodbridge')
    .set('X-Forwarded-For', `203.0.113.${n}`)
    .set('X-Real-IP', `192.0.2.${n}`)
    .set('X-Vercel-Forwarded-For', `192.0.2.${n}`)
    .set('Forwarded', `for=192.0.2.${n}`)
    .send({});
}
describe('explicit single-process Render demo', () => {
  it.each(['login', 'register'])(
    'keeps a real conservative %s budget regardless of forged client headers',
    async (endpoint) => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const app = createApp(config(), { logger });
      expect(app.get('trust proxy')).toBe(false);
      for (const n of [1, 2, 3])
        expect((await attempt(app, endpoint, n)).status).toBe(
          n === 3 ? 429 : 400,
        );
      expect(fetchSpy).not.toHaveBeenCalled();
      const other = endpoint === 'login' ? 'register' : 'login';
      expect((await attempt(app, other, 4)).status).toBe(400);
      expect(
        (await attempt(app, endpoint, 5)).headers['retry-after'],
      ).toBeDefined();
    },
  );
  it('uses only the socket peer for address inspection, never claiming a real client IP', () => {
    const get = vi.fn(() => '203.0.113.9');
    expect(
      clientAddress(
        { get, ip: '203.0.113.9', socket: { remoteAddress: '127.0.0.1' } },
        config(),
      ),
    ).toBe('127.0.0.1');
    expect(get).not.toHaveBeenCalled();
  });
  it.each([
    { DEMO_SINGLE_PROCESS: 'false' },
    { NODE_ENV: 'test' },
    { RENDER: 'false' },
    { VERCEL: '1' },
    { CLIENT_IP_SOURCE: 'express' },
    { TRUSTED_PROXY_CIDRS: '127.0.0.1/32' },
    {
      UPSTASH_REDIS_REST_URL: 'https://isolated.example.test',
      UPSTASH_REDIS_REST_TOKEN: 'fixture-only-token',
    },
  ])('rejects unsafe/ambiguous demo configuration (%#)', (extra) =>
    expect(() => config(extra)).toThrow(),
  );
  it('does not remove CSRF or exact credentialed CORS checks', async () => {
    const app = createApp(config(), { logger });
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .set('Origin', base.CLIENT_ORIGIN)
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/auth/login')
          .set('Origin', 'https://other.example.test')
          .set('X-CSRF-Protection', 'foodbridge')
          .send({})
      ).status,
    ).toBe(403);
    const allowed = await request(app)
      .options('/api/auth/login')
      .set('Origin', base.CLIENT_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-protection');
    expect(allowed.headers['access-control-allow-origin']).toBe(
      base.CLIENT_ORIGIN,
    );
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const denied = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'https://other.example.test');
    expect(denied.headers).not.toHaveProperty('access-control-allow-origin');
  });
});
