import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const script = fileURLToPath(
  new URL('../scripts/bootstrapAdmin.js', import.meta.url),
);
describe('admin bootstrap environment guard', () => {
  it.each(['test', 'production'])(
    'refuses %s before attempting any database operation',
    (mode) => {
      let failure;
      try {
        execFileSync(process.execPath, [script], {
          env: {
            ...process.env,
            NODE_ENV: mode,
            CLIENT_ORIGINS: 'https://foodbridge.example.test',
            JWT_SECRET: 'isolated-bootstrap-test-secret-at-least-32-characters',
            MONGODB_URI: 'mongodb://127.0.0.1:1/never-connect',
          },
          stdio: 'pipe',
          timeout: 5000,
        });
      } catch (error) {
        failure = error;
      }
      expect(failure?.status).toBe(1);
      expect(failure.stderr.toString()).toContain(
        'Admin bootstrap is development-only',
      );
      expect(failure.stderr.toString()).not.toContain('never-connect');
    },
  );
});
