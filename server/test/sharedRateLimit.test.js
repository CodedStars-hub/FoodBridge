import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';
import { createLogger } from '../src/utils/logger.js';
import { RedisRateLimitStore } from '../src/stores/redisRateLimitStore.js';
import {
  redisRestFixture,
  redisFixtureEnvironment,
} from './helpers/redisRestFixture.js';
vi.mock('../src/middleware/databaseReady.js', () => ({
  databaseReady: (_req, _res, next) => next(),
}));
const base = {
  ...redisFixtureEnvironment,
  NODE_ENV: 'production',
  VERCEL: '1',
  CLIENT_IP_SOURCE: 'vercel',
  CLIENT_ORIGIN: 'https://demo.example.test',
  JWT_SECRET: 'isolated-shared-counter-fixture-at-least-32-characters',
  LOGIN_RATE_LIMIT: '2',
  REGISTER_RATE_LIMIT: '2',
};
const config = (extra = {}) => parseEnvironment({ ...base, ...extra });
const logger = createLogger({ write: () => {} });
let provider, transport;
beforeEach(() => {
  provider = redisRestFixture();
  transport = vi.fn(provider.fetch);
  vi.stubGlobal('fetch', transport);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function attempt(app, endpoint = 'login', ip = '203.0.113.10', headers = {}) {
  return request(app)
    .post(`/api/auth/${endpoint}`)
    .set('Origin', base.CLIENT_ORIGIN)
    .set('X-CSRF-Protection', 'foodbridge')
    .set('X-Vercel-Forwarded-For', ip)
    .set(headers)
    .send({});
}
describe('shared production rate limits across Function instances', () => {
  it.each(['login', 'register'])(
    'atomically shares the %s budget across concurrent requests and new instances',
    async (endpoint) => {
      const a = createApp(config(), { logger }),
        b = createApp(config(), { logger });
      const replies = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          attempt(index % 2 ? a : b, endpoint),
        ),
      );
      expect(replies.filter((reply) => reply.status === 400)).toHaveLength(2);
      expect(replies.filter((reply) => reply.status === 429)).toHaveLength(18);
      expect(
        replies.find((reply) => reply.status === 429).headers['retry-after'],
      ).toBeDefined();
      expect(
        (await attempt(createApp(config(), { logger }), endpoint)).status,
      ).toBe(429);
      expect(provider.counters.size).toBe(1);
      expect(transport).toHaveBeenCalledTimes(21);
      const command = JSON.parse(provider.requests[0].body);
      expect(command[0]).toBe('EVAL');
      expect(command[3]).not.toContain('203.0.113.10');
      expect(command[3]).not.toContain(base.JWT_SECRET);
      expect(provider.requests[0]).toMatchObject({
        redirect: 'error',
        cache: 'no-store',
      });
      expect(provider.requests[0].signal).toBeInstanceOf(AbortSignal);
    },
  );
  it('preserves independent endpoint, client and environment budgets', async () => {
    const a = createApp(config(), { logger }),
      b = createApp(config(), { logger });
    await attempt(a);
    await attempt(b);
    expect((await attempt(a)).status).toBe(429);
    expect((await attempt(b, 'register')).status).toBe(400);
    expect((await attempt(b, 'login', '203.0.113.11')).status).toBe(400);
    expect(
      (
        await attempt(
          createApp(config({ RATE_LIMIT_NAMESPACE: 'isolated-preview' }), {
            logger,
          }),
        )
      ).status,
    ).toBe(400);
  });
  it('does not extend the fixed window and resets only after shared expiry', async () => {
    const a = createApp(config(), { logger }),
      b = createApp(config(), { logger });
    await attempt(a);
    provider.advance(60000);
    await attempt(b);
    expect((await attempt(a)).status).toBe(429);
    provider.advance(840001);
    expect((await attempt(b)).status).toBe(400);
  });
  it('ignores forged forwarding prefixes and normalizes IPv6 before sharing keys', async () => {
    const a = createApp(config(), { logger }),
      b = createApp(config(), { logger });
    for (const n of [1, 2, 3]) {
      expect(
        (
          await attempt(n % 2 ? a : b, 'login', `2001:db8:abcd:1200::${n}`, {
            'X-Forwarded-For': `192.0.2.${n}`,
            'X-Real-IP': `192.0.2.${n}`,
            Forwarded: `for=192.0.2.${n}`,
          })
        ).status,
      ).toBe(n === 3 ? 429 : 400);
    }
    expect((await attempt(b, 'login', '2001:db8:abcd:1300::1')).status).toBe(
      400,
    );
    expect(a.get('trust proxy')).toBe(false);
  });
  it.each([
    async () => {
      throw new Error('isolated provider outage');
    },
    async () => {
      throw new DOMException('isolated timeout', 'TimeoutError');
    },
    async () => ({
      ok: false,
      json: async () => ({ error: 'isolated provider body' }),
    }),
    async () => ({
      ok: true,
      json: async () => ({ error: 'isolated command failure' }),
    }),
    async () => ({ ok: true, json: async () => ({ result: [0, 100] }) }),
    async () => ({ ok: true, json: async () => ({ result: [1, -1] }) }),
    async () => ({ ok: true, json: async () => ({ result: [1, 900001] }) }),
  ])(
    'fails closed during a store outage or invalid response (%#)',
    async (failure) => {
      transport.mockImplementation(failure);
      const app = createApp(config(), { logger });
      const result = await attempt(app);
      expect(result.status).toBe(503);
      expect(result.body.error.message).toContain(
        'throttling is temporarily unavailable',
      );
      expect(JSON.stringify(result.body)).not.toContain('isolated');
      expect(transport).toHaveBeenCalledOnce(); // No ambiguous-write retry or local fallback.
      expect((await request(app).get('/api/health')).status).toBe(200);
      expect((await request(app).get('/api/auth/me')).status).toBe(401);
    },
  );
  it('fails closed when production credentials are missing, without contacting a provider', async () => {
    const app = createApp(
      config({ UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' }),
      { logger },
    );
    expect((await attempt(app)).status).toBe(503);
    expect((await attempt(app, 'register')).status).toBe(503);
    expect(transport).not.toHaveBeenCalled();
  });
  it('supports the Express store decrement/reset contract without exposing an HTTP reset action', async () => {
    transport.mockResolvedValue({
      ok: true,
      json: async () => ({ result: 0 }),
    });
    const store = new RedisRateLimitStore(config(), 'login');
    await store.decrement('203.0.113.10');
    await store.resetKey('203.0.113.10');
    const commands = transport.mock.calls.map(([, options]) =>
      JSON.parse(options.body),
    );
    expect(commands[0][0]).toBe('EVAL');
    expect(commands[1]).toEqual(['DEL', store.key('203.0.113.10')]);
  });
  it.each([
    { UPSTASH_REDIS_REST_TOKEN: '' },
    { UPSTASH_REDIS_REST_URL: 'http://localhost:6379' },
    { UPSTASH_REDIS_REST_URL: 'https://user:fixture@example.test' },
    { UPSTASH_REDIS_REST_URL: 'https://example.test/?token=fixture' },
    { RATE_LIMIT_NAMESPACE: 'unsafe:namespace' },
  ])('rejects incomplete or unsafe provider configuration (%#)', (extra) => {
    expect(() => config(extra)).toThrow();
  });
});
