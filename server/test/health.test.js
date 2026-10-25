import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/env.js';
const config = parseEnvironment({
  NODE_ENV: 'test',
  JWT_SECRET: 'test-only-secret-with-at-least-32-characters',
});
const app = createApp(config);
describe('API foundation without MongoDB', () => {
  it('returns health and security headers', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      application: 'FoodBridge',
      uptime: expect.any(Number),
      timestamp: expect.any(String),
    });
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
  it('keeps health available while account features require a database', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(503);
    expect(response.body.error.message).toMatch(/unavailable/);
    expect((await request(app).get('/api/health')).status).toBe(200);
  });
  it('sets CORS to the configured client', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', config.CLIENT_ORIGIN);
    expect(response.headers['access-control-allow-origin']).toBe(
      config.CLIENT_ORIGIN,
    );
  });
  it('returns a JSON 404', async () => {
    const response = await request(app).get('/api/missing');
    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('Route not found');
  });
  it('handles invalid JSON', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{');
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Invalid JSON body');
  });
  it('limits request bodies', async () => {
    const response = await request(
      createApp({ ...config, JSON_BODY_LIMIT: '10b' }),
    )
      .post('/api/health')
      .send({ message: 'a'.repeat(30) });
    expect(response.status).toBe(413);
    expect(response.body.error.message).toBe('Request body too large');
  });
  it('rejects invalid environment values without revealing them', () => {
    expect(() =>
      parseEnvironment({ PORT: 'invalid', MONGODB_URI: 'secret-value' }),
    ).toThrow(
      'Invalid environment configuration: PORT, MONGODB_URI, JWT_SECRET',
    );
  });
});
