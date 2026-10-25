import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../src/config/env.js';
const secret = 'test-only-secret-with-at-least-32-characters';
describe('authentication environment validation', () => {
  it('requires a configured secret and refuses example placeholders', () => {
    expect(() => parseEnvironment({})).toThrow('JWT_SECRET');
    expect(() =>
      parseEnvironment({
        JWT_SECRET: 'REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS',
      }),
    ).toThrow('JWT_SECRET');
  });
  it('parses an explicit multi-origin allowlist', () => {
    expect(
      parseEnvironment({
        JWT_SECRET: secret,
        CLIENT_ORIGINS: 'http://localhost:5173, http://localhost:4173',
      }).CLIENT_ORIGINS,
    ).toEqual(['http://localhost:5173', 'http://localhost:4173']);
  });
  it.each([
    '*',
    'https://example.test/path',
    'https://example.test/',
    'invalid',
    'http://localhost:5173,',
  ])('rejects an invalid origin allowlist: %s', (origin) => {
    expect(() =>
      parseEnvironment({ JWT_SECRET: secret, CLIENT_ORIGINS: origin }),
    ).toThrow('CLIENT_ORIGINS');
  });
  it('requires production HTTPS for cross-site cookies', () => {
    expect(() =>
      parseEnvironment({ JWT_SECRET: secret, COOKIE_SAME_SITE: 'none' }),
    ).toThrow('HTTPS');
    expect(() =>
      parseEnvironment({ JWT_SECRET: secret, NODE_ENV: 'production' }),
    ).toThrow('HTTPS');
    const config = parseEnvironment({
      JWT_SECRET: secret,
      NODE_ENV: 'production',
      CLIENT_ORIGINS: 'https://foodbridge.example.test',
      COOKIE_SAME_SITE: 'none',
    });
    expect(config.COOKIE_SAME_SITE).toBe('none');
  });
  it('bounds token lifetimes', () => {
    expect(() =>
      parseEnvironment({ JWT_SECRET: secret, JWT_EXPIRES_SECONDS: '0' }),
    ).toThrow('JWT_EXPIRES_SECONDS');
    expect(() =>
      parseEnvironment({
        JWT_SECRET: secret,
        JWT_EXPIRES_SECONDS: '999999999',
      }),
    ).toThrow('JWT_EXPIRES_SECONDS');
  });
});
