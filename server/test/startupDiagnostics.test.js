import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/utils/logger.js';
import { startupDiagnostics } from '../src/utils/startupDiagnostics.js';
const script = fileURLToPath(new URL('../src/index.js', import.meta.url));
const fakeSecret = 'isolated-startup-secret-not-a-real-credential';
const base = {
  ...process.env,
  NODE_ENV: 'production',
  RENDER: 'true',
  RENDER_SERVICE_TYPE: 'web',
  VERCEL: '0',
  CLIENT_IP_SOURCE: 'socket',
  RATE_LIMIT_STORE: 'process-demo',
  DEMO_SINGLE_PROCESS: 'true',
  COOKIE_SAME_SITE: 'none',
  CLIENT_ORIGIN: 'https://foodbridge-fixture.vercel.app',
  CLIENT_ORIGINS: '',
  MONGODB_URI: 'mongodb://127.0.0.1:1/isolated-startup-fixture',
  JWT_SECRET: fakeSecret,
  TRUSTED_PROXY_CIDRS: '',
  UPSTASH_REDIS_REST_URL: '',
  UPSTASH_REDIS_REST_TOKEN: '',
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
  MATCH_DISTANCE_WEIGHT: '40',
  MATCH_QUANTITY_WEIGHT: '35',
  MATCH_TIME_WEIGHT: '25',
};
function failedStartup(overrides) {
  let failure;
  try {
    execFileSync(process.execPath, [script], {
      env: { ...base, ...overrides },
      timeout: 12000,
      stdio: 'pipe',
    });
  } catch (error) {
    failure = error;
  }
  expect(failure?.status).toBe(1);
  const output = `${failure.stdout}${failure.stderr}`;
  expect(output).not.toContain(fakeSecret);
  expect(output).not.toContain(base.MONGODB_URI);
  const records = output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  return {
    records,
    fatal: records.find((row) => row.event === 'server_failed'),
  };
}
describe('safe production startup diagnostics', () => {
  it('reproduces the HTTP localhost production-origin blocker with a clear stage and safe stack', () => {
    const { records, fatal } = failedStartup({
      CLIENT_ORIGIN: 'http://localhost:5173',
    });
    expect(fatal.stage).toBe('environment');
    expect(fatal.error.message).toBe(
      'Production client origins must use HTTPS',
    );
    expect(fatal.error.stack).toContain('server/src/config/env.js:');
    expect(fatal.error.stack).toContain('server/src/index.js:');
    expect(records.some((row) => row.event === 'demo_rate_limit_mode')).toBe(
      false,
    );
    expect(records.some((row) => row.stage === 'database_connection')).toBe(
      false,
    );
  });
  it.each([
    [
      { CLIENT_ORIGIN: 'https://foodbridge-fixture.vercel.app/' },
      'CLIENT_ORIGIN',
    ],
    [
      { CLIENT_ORIGINS: 'https://foodbridge-fixture.vercel.app/path' },
      'CLIENT_ORIGINS',
    ],
    [{ JWT_SECRET: 'short-fixture' }, 'JWT_SECRET'],
    [{ VERCEL: '1' }, 'VERCEL'],
    [
      {
        UPSTASH_REDIS_REST_URL: 'https://fixture.example.test',
        UPSTASH_REDIS_REST_TOKEN: 'fixture-only-redis-token',
      },
      'UPSTASH_REDIS_REST_URL',
    ],
  ])('reports only invalid configuration names (%#)', (overrides, field) => {
    const { fatal } = failedStartup(overrides);
    expect(fatal.stage).toBe('environment');
    expect(fatal.error.message).toContain(field);
    expect(JSON.stringify(fatal)).not.toMatch(
      /short-fixture|fixture-only-redis-token/,
    );
  });
  it('distinguishes a failed MongoDB connection from environment validation', () => {
    const { records, fatal } = failedStartup({});
    expect(records.some((row) => row.event === 'demo_rate_limit_mode')).toBe(
      true,
    );
    expect(fatal.stage).toBe('database_connection');
    expect(fatal.error.message).toContain('MongoDB connection failed');
    expect(fatal.error.stack).toContain('server/src/config/database.js:');
  }, 15000);
  it.each([
    ['MongoParseError', undefined, 'URI parsing'],
    ['MongoServerError', 18, 'authentication failed'],
    ['MongoServerError', 13, 'authorization failed'],
    ['MongoServerError', 11000, 'unique-index'],
    ['MongoServerError', 85, 'index definition'],
    ['Error', 'EADDRINUSE', 'already in use'],
  ])(
    'categorizes %s/%s without logging raw provider text',
    (name, code, expected) => {
      const error = Object.assign(
        new Error(
          `mongodb://fixture:${fakeSecret}@private-host/db token=${fakeSecret}`,
        ),
        { name, code },
      );
      expect(startupDiagnostics(error).message).toContain(expected);
      expect(JSON.stringify(startupDiagnostics(error))).not.toMatch(
        /mongodb:|private-host|token=/,
      );
    },
  );
  it('includes only known messages and application frame locations, never arbitrary secrets', () => {
    const lines = [];
    const logger = createLogger({
      environment: 'production',
      write: (line) => lines.push(line),
    });
    const error = Object.assign(new Error(fakeSecret), {
      stack: `Error: ${fakeSecret}\n    at ${fakeSecret} (/private/${fakeSecret}/server/src/config/database.js:32:9)\n    at (/private/${fakeSecret}/unknown.js:1:2)\nAuthorization: Bearer ${fakeSecret}`,
      cause: { uri: `mongodb://user:${fakeSecret}@host/db`, token: fakeSecret },
      startupModel: 'User',
    });
    logger.error('server_failed', {
      error,
      stage: 'database_indexes',
      env: base,
    });
    const row = JSON.parse(lines[0]);
    expect(row).toMatchObject({
      stage: 'database_indexes',
      model: 'User',
      error: { type: 'Error', stack: 'at server/src/config/database.js:32:9' },
    });
    expect(lines[0]).not.toContain(fakeSecret);
    expect(lines[0]).not.toMatch(/mongodb:|Authorization|unknown.js/);
    logger.error('http_error', { error });
    expect(JSON.parse(lines[1]).error).toEqual({ type: 'Error' });
  });
  it('does not accept forged configuration field text as safe exception content', () => {
    const error = new Error(
      `Invalid environment configuration: JWT_SECRET, ${fakeSecret}`,
    );
    expect(startupDiagnostics(error).message).not.toContain(fakeSecret);
  });
});
