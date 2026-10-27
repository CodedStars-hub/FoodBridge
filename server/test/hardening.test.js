import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import express from 'express';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';
import { createLogger } from '../src/utils/logger.js';
import { requestLogging } from '../src/middleware/requestLogging.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
vi.mock('../src/middleware/databaseReady.js', () => ({
  databaseReady: (_req, _res, next) => next(),
}));
const base = {
  NODE_ENV: 'test',
  JWT_SECRET: 'hardening-fixture-only-secret-at-least-32-characters',
  LOGIN_RATE_LIMIT: '2',
  REGISTER_RATE_LIMIT: '2',
};
const config = (overrides = {}) => parseEnvironment({ ...base, ...overrides });
function attempt(app, endpoint, forwarded, extra = {}) {
  const req = request(app)
    .post(`/api/auth/${endpoint}`)
    .set('Origin', 'http://localhost:5173')
    .set('X-CSRF-Protection', 'foodbridge')
    .set(extra);
  if (forwarded) req.set('X-Forwarded-For', forwarded);
  return req.send({}); // Rejected by validation; no database or password work needed.
}
afterEach(() => vi.restoreAllMocks());
describe('proxy-aware authentication throttling', () => {
  it.each(['login', 'register'])(
    'ignores spoofed forwarding headers in direct mode for %s',
    async (endpoint) => {
      const app = createApp(config());
      expect((await attempt(app, endpoint, '203.0.113.1')).status).toBe(400);
      expect((await attempt(app, endpoint, '203.0.113.2')).status).toBe(400);
      expect(
        (
          await attempt(app, endpoint, '203.0.113.3', {
            Forwarded: 'for=192.0.2.1',
            'X-Real-IP': '192.0.2.2',
          })
        ).status,
      ).toBe(429);
    },
  );
  it.each(['login', 'register'])(
    'uses distinct real clients and ignores forged leftmost XFF values for %s',
    async (endpoint) => {
      const app = createApp(
        config({ TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128' }),
      );
      expect(
        (await attempt(app, endpoint, '192.0.2.1, 203.0.113.10')).status,
      ).toBe(400);
      expect(
        (await attempt(app, endpoint, '192.0.2.2, 203.0.113.10')).status,
      ).toBe(400);
      expect(
        (await attempt(app, endpoint, '192.0.2.3, 203.0.113.10')).status,
      ).toBe(429);
      expect((await attempt(app, endpoint, '203.0.113.11')).status).toBe(400);
    },
  );
  it('ignores XFF from an untrusted immediate peer even with a proxy allowlist configured', async () => {
    const app = createApp(config({ TRUSTED_PROXY_CIDRS: '10.23.1.4/32' }));
    for (const n of [1, 2])
      expect((await attempt(app, 'login', `203.0.113.${n}`)).status).toBe(400);
    expect((await attempt(app, 'login', '203.0.113.3')).status).toBe(429);
  });
  it('walks multiple explicitly trusted proxies right-to-left and stops at the nearest untrusted address', async () => {
    const app = createApp(
      config({ TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128,10.23.1.4/32' }),
    );
    for (const n of [1, 2])
      expect(
        (await attempt(app, 'login', `192.0.2.${n}, 203.0.113.10, 10.23.1.4`))
          .status,
      ).toBe(400);
    expect(
      (await attempt(app, 'login', '192.0.2.3, 203.0.113.10, 10.23.1.4'))
        .status,
    ).toBe(429);
  });
  it('does not trust an unlisted intermediate proxy', async () => {
    const app = createApp(
      config({ TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128' }),
    );
    for (const n of [1, 2])
      expect(
        (await attempt(app, 'login', `203.0.113.${n}, 10.23.1.4`)).status,
      ).toBe(400);
    expect((await attempt(app, 'login', '203.0.113.3, 10.23.1.4')).status).toBe(
      429,
    );
  });
  it('falls back to the peer bucket for malformed addresses instead of accepting arbitrary keys', async () => {
    const app = createApp(
      config({ TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128' }),
    );
    for (const value of ['invalid-a', 'invalid-b'])
      expect((await attempt(app, 'login', value)).status).toBe(400);
    expect((await attempt(app, 'login', 'invalid-c')).status).toBe(429);
  });
  it('groups IPv6 client rotations within their /56 subnet', async () => {
    const app = createApp(
      config({ TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128' }),
    );
    for (const n of [1, 2])
      expect(
        (await attempt(app, 'login', `2001:db8:abcd:1200::${n}`)).status,
      ).toBe(400);
    expect((await attempt(app, 'login', '2001:db8:abcd:1200::3')).status).toBe(
      429,
    );
    expect((await attempt(app, 'login', '2001:db8:abcd:1300::1')).status).toBe(
      400,
    );
  });
  it('preserves the configured independent signup and login budgets', async () => {
    const app = createApp(config());
    for (const endpoint of ['register', 'login']) {
      expect((await attempt(app, endpoint)).status).toBe(400);
      expect((await attempt(app, endpoint)).status).toBe(400);
      const blocked = await attempt(app, endpoint);
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    }
    expect(parseEnvironment(base).LOGIN_RATE_LIMIT).toBe(2);
    expect(
      parseEnvironment({
        ...base,
        LOGIN_RATE_LIMIT: undefined,
        REGISTER_RATE_LIMIT: undefined,
      }),
    ).toMatchObject({ LOGIN_RATE_LIMIT: 20, REGISTER_RATE_LIMIT: 10 });
  });
  it.each([
    'true',
    '1',
    '*',
    'loopback',
    'uniquelocal',
    '0.0.0.0/0',
    '::/0',
    '10.0.0.1/33',
    'bad',
    '127.0.0.1,',
  ])('rejects unsafe proxy configuration %s', (value) => {
    expect(() => config({ TRUSTED_PROXY_CIDRS: value })).toThrow(
      'TRUSTED_PROXY_CIDRS',
    );
  });
  it('requires explicit proxy ranges for production Render web services but not cron jobs', () => {
    const render = {
      NODE_ENV: 'production',
      CLIENT_ORIGIN: 'https://app.example.test',
      RENDER: 'true',
    };
    expect(() => config(render)).toThrow('verified TRUSTED_PROXY_CIDRS');
    expect(
      config({ ...render, TRUSTED_PROXY_CIDRS: '10.23.1.4/32' })
        .TRUSTED_PROXY_CIDRS,
    ).toEqual(['10.23.1.4/32']);
    expect(() =>
      config({ ...render, RENDER_SERVICE_TYPE: 'cron' }),
    ).not.toThrow();
  });
});

describe('request logging and redaction', () => {
  function capture() {
    const lines = [];
    return {
      lines,
      logger: createLogger({
        environment: 'production',
        write: (line) => lines.push(line),
      }),
    };
  }
  it('logs request ID, route template, method, status and duration without request content', async () => {
    const { lines, logger } = capture();
    const app = createApp(config(), { logger });
    const response = await request(app)
      .get('/api/health?token=private-query')
      .set('Authorization', 'Bearer private-authorization')
      .set('Cookie', 'session=private-cookie')
      .set('X-Request-ID', 'private-user-request-id');
    const record = JSON.parse(lines[0]);
    expect(record).toMatchObject({
      event: 'http_request',
      method: 'GET',
      route: '/api/health/',
      status: 200,
      durationMs: expect.any(Number),
    });
    expect(record.requestId).toBe(response.headers['x-request-id']);
    expect(record.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(lines.join()).not.toMatch(/private-/);
  });
  it('logs unexpected failures safely and keeps client messages generic', async () => {
    const { lines, logger } = capture();
    const app = express();
    app.set('logger', logger);
    app.use(requestLogging(logger));
    app.get('/api/donations/:id', (_req, _res) => {
      throw Object.assign(
        new TypeError('mongodb://user:secret@host/db private-password'),
        { code: 'private-code', stack: 'private-stack', token: 'private-jwt' },
      );
    });
    app.use(errorHandler);
    const response = await request(app).get(
      '/api/donations/private-id?token=private-query',
    );
    expect(response.status).toBe(500);
    expect(response.body.error.message).toBe('Internal server error');
    const records = lines.map((line) => JSON.parse(line));
    expect(records.find((r) => r.event === 'http_error')).toMatchObject({
      error: { type: 'TypeError' },
      route: '/api/donations/:id',
      requestId: response.headers['x-request-id'],
      status: 500,
    });
    expect(records.find((r) => r.event === 'http_request').status).toBe(500);
    expect(lines.join()).not.toMatch(/private-|mongodb:|password|secret@/);
  });
  it('drops nested secrets, arbitrary fields, raw errors, queries and identifiers', () => {
    const { lines, logger } = capture();
    logger.error('http_error', {
      authorization: 'private-auth',
      cookie: 'private-cookie',
      password: 'private-password',
      jwt: 'private-jwt',
      headers: { Authorization: 'private-header' },
      body: { donation: 'private-donation', user: 'private-user' },
      uri: 'mongodb://private-db',
      route: '/api/donations/private-id?private-query',
      error: {
        name: 'private-error-name',
        message: 'private-message',
        stack: 'private-stack',
        cause: { secret: 'private-cause' },
        code: 'private-code',
      },
    });
    expect(lines.join()).not.toMatch(/private-|mongodb:/);
    expect(JSON.parse(lines[0]).error).toEqual({ type: 'Error' });
  });
  it('preserves readable development output and tolerates a broken logging sink', () => {
    const lines = [];
    createLogger({
      environment: 'development',
      write: (line) => lines.push(line),
    }).info('server_started');
    expect(lines[0]).toContain('INFO server_started');
    expect(() =>
      createLogger({
        environment: 'production',
        write: () => {
          throw new Error('sink');
        },
      }).error('server_failed'),
    ).not.toThrow();
  });
  it('logs unmatched routes without path/query details', async () => {
    const { lines, logger } = capture();
    await request(createApp(config(), { logger })).get(
      '/private-path?password=private-password',
    );
    expect(JSON.parse(lines[0]).route).toBe('unmatched');
    expect(lines.join()).not.toContain('private-');
  });
});

describe('dependency readiness', () => {
  it('keeps liveness available but returns 503 readiness without a database', async () => {
    const app = createApp(config());
    expect((await request(app).get('/api/health')).status).toBe(200);
    const response = await request(app).get('/api/health/ready');
    expect(response.status).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      status: 'not_ready',
      application: 'FoodBridge',
    });
  });
  it.each([
    'disconnected',
    'ping-failure',
    'standalone',
    'no-sessions',
    'available',
  ])('reports correct readiness for %s', async (scenario) => {
    vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(
      scenario === 'disconnected' ? 0 : 1,
    );
    const command = vi.fn(async (input) => {
      if (scenario === 'ping-failure')
        throw new Error('mongodb://private:password@host/db');
      if (input.ping) return { ok: 1 };
      return {
        ok: 1,
        ...(scenario !== 'standalone' ? { setName: 'test-fixture' } : {}),
        ...(scenario !== 'no-sessions'
          ? { logicalSessionTimeoutMinutes: 30 }
          : {}),
      };
    });
    const previous = mongoose.connection.db;
    mongoose.connection.db = { admin: () => ({ command }) };
    try {
      const response = await request(createApp(config())).get(
        '/api/health/ready',
      );
      expect(response.status).toBe(scenario === 'available' ? 200 : 503);
      expect(JSON.stringify(response.body)).not.toMatch(
        /private|password|test-fixture/,
      );
      if (scenario !== 'disconnected')
        expect(command).toHaveBeenCalledWith({ ping: 1 }, { timeoutMS: 2000 });
    } finally {
      mongoose.connection.db = previous;
    }
  });
});
