// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
const config = JSON.parse(
  readFileSync(resolve(process.cwd(), '../vercel.json'), 'utf8'),
);
describe('production frontend hosting contract', () => {
  it('builds only the client workspace and publishes its actual output', () => {
    expect(config.buildCommand).toBe('npm run build -w client');
    expect(config.outputDirectory).toBe('client/dist');
    expect(config.installCommand).toBe('npm ci --include=dev');
    expect(config).not.toHaveProperty('env');
  });
  it('provides an index fallback for public and protected deep links', () => {
    const fallback = config.rewrites.find(
      (rule) => rule.destination === '/index.html',
    );
    expect(fallback).toBeDefined();
    const match = new RegExp(`^${fallback.source}$`);
    for (const path of [
      '/register',
      '/login',
      '/dashboard/donor/donations/fixture',
      '/dashboard/ngo/nearby',
      '/dashboard/volunteer/pickups/fixture',
      '/dashboard/admin/analytics',
    ])
      expect(path).toMatch(match);
  });
  it('sets static host security headers separately from the API without guessing origins', () => {
    const headers = Object.fromEntries(
      config.headers[0].headers.map(({ key, value }) => [
        key.toLowerCase(),
        value,
      ]),
    );
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['strict-transport-security']).toBe('max-age=31536000');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers).not.toHaveProperty('access-control-allow-origin');
  });
});
