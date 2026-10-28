// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
const configPath = existsSync(resolve(import.meta.dirname, '../vercel.json'))
  ? resolve(import.meta.dirname, '../vercel.json')
  : existsSync(resolve(process.cwd(), 'vercel.json'))
    ? resolve(process.cwd(), 'vercel.json')
    : resolve(process.cwd(), '../vercel.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
describe('production frontend hosting contract', () => {
  it('builds only the client workspace and publishes its actual output', () => {
    expect(['npm run build', 'npm run build -w client']).toContain(
      config.buildCommand,
    );
    expect(['dist', 'client/dist']).toContain(config.outputDirectory);
    if (config.installCommand) {
      expect(config.installCommand).toBe('npm ci --include=dev');
    }
    expect(config).not.toHaveProperty('env');
  });
  it('serves only the frontend SPA, without a backend Function or API rewrite', () => {
    expect(config).not.toHaveProperty('functions');
    expect(config.rewrites).toEqual([
      { source: '/(.*)', destination: '/index.html' },
    ]);
    const fallback = config.rewrites.at(-1);
    expect(fallback.destination).toBe('/index.html');
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
