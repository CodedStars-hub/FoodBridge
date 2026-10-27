import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('persistent local entry point', () => {
  it.each(['local', 'render-demo'])(
    'starts HTTP and Socket.IO on PORT and closes gracefully in %s mode',
    async (mode) => {
      const probe = createServer();
      probe.listen(0, '127.0.0.1');
      await once(probe, 'listening');
      const { port } = probe.address();
      await new Promise((resolve) => probe.close(resolve));
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL('../src/index.js', import.meta.url))],
        {
          env: {
            ...process.env,
            NODE_ENV: mode === 'local' ? 'test' : 'production',
            RATE_LIMIT_STORE: mode === 'local' ? 'auto' : 'process-demo',
            DEMO_SINGLE_PROCESS: mode === 'local' ? 'false' : 'true',
            UPSTASH_REDIS_REST_URL: '',
            UPSTASH_REDIS_REST_TOKEN: '',
            PORT: String(port),
            MONGODB_URI: '',
            JWT_SECRET: 'isolated-local-startup-fixture-at-least-32-characters',
            CLIENT_ORIGIN:
              mode === 'local'
                ? 'http://localhost:5173'
                : 'https://foodbridge-demo.vercel.app',
            CLIENT_ORIGINS:
              mode === 'local'
                ? 'http://localhost:5173'
                : 'https://foodbridge-demo.vercel.app',
            CLIENT_IP_SOURCE: mode === 'local' ? 'express' : 'socket',
            VERCEL: '0',
            RENDER: mode === 'local' ? 'false' : 'true',
            TRUSTED_PROXY_CIDRS: '',
            COOKIE_SAME_SITE: mode === 'local' ? 'lax' : 'none',
            CLOUDINARY_CLOUD_NAME: '',
            CLOUDINARY_API_KEY: '',
            CLOUDINARY_API_SECRET: '',
          },
          stdio: 'ignore',
        },
      );
      const exited = once(child, 'exit');
      try {
        let response;
        for (let i = 0; i < 100; i++) {
          if (child.exitCode !== null)
            throw new Error('Local server exited before readiness');
          try {
            response = await fetch(`http://127.0.0.1:${port}/api/health`, {
              signal: AbortSignal.timeout(500),
            });
            break;
          } catch {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
        expect(response?.status).toBe(200);
        expect((await response.json()).application).toBe('FoodBridge');
        const handshake = await fetch(
          `http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`,
          {
            headers: {
              Origin:
                mode === 'local'
                  ? 'http://localhost:5173'
                  : 'https://foodbridge-demo.vercel.app',
            },
          },
        );
        expect(handshake.status).toBe(200);
        expect(await handshake.text()).toMatch(/^0\{/);
        child.kill('SIGTERM');
        const [code, signal] = await exited;
        expect(code).toBe(0);
        expect(signal).toBeNull();
      } finally {
        if (child.exitCode === null) {
          child.kill('SIGKILL');
          await exited;
        }
      }
    },
    15000,
  );
});
