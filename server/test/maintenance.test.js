import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runJob } from '../src/utils/jobRunner.js';
import { createLogger } from '../src/utils/logger.js';
import { runMaintenance } from '../src/services/maintenanceService.js';
import * as database from '../src/config/database.js';
import * as workflow from '../src/services/donationWorkflow.js';
import * as images from '../src/services/imageService.js';
import * as cloud from '../src/services/cloudinaryClient.js';
vi.mock('../src/config/database.js', () => ({
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
}));
vi.mock('../src/services/donationWorkflow.js', () => ({
  expireDonations: vi.fn(),
}));
vi.mock('../src/services/imageService.js', () => ({ cleanupImages: vi.fn() }));
vi.mock('../src/services/cloudinaryClient.js', () => ({
  cloudinaryEnabled: vi.fn(),
}));
let lines;
beforeEach(() => {
  vi.resetAllMocks();
  lines = [];
  vi.spyOn(console, 'info').mockImplementation((line) => lines.push(line));
  vi.spyOn(console, 'error').mockImplementation((line) => lines.push(line));
  for (const [key, value] of Object.entries({
    NODE_ENV: 'production',
    RENDER: 'false',
    CLIENT_ORIGINS: 'https://app.example.test',
    JWT_SECRET: 'job-fixture-only-secret-at-least-32-characters',
    MONGODB_URI: 'mongodb://private-fixture-host/test',
  }))
    vi.stubEnv(key, value);
  vi.mocked(database.connectDatabase).mockResolvedValue(true);
  vi.mocked(database.disconnectDatabase).mockResolvedValue();
  vi.mocked(workflow.expireDonations).mockResolvedValue(3);
  vi.mocked(cloud.cloudinaryEnabled).mockReturnValue(true);
  vi.mocked(images.cleanupImages).mockResolvedValue({
    removed: 1,
    failed: 0,
    pending: false,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const records = () => lines.map((line) => JSON.parse(line));
describe('observable maintenance jobs', () => {
  it('records start and completion with matching IDs, counts and duration', async () => {
    expect(await runMaintenance('expire_donations')).toBe(0);
    const events = records();
    expect(events.map((r) => r.event)).toEqual([
      'job_started',
      'job_completed',
    ]);
    expect(events[1]).toMatchObject({
      job: 'expire_donations',
      runId: events[0].runId,
      expiredCount: 3,
      durationMs: expect.any(Number),
    });
    expect(database.disconnectDatabase).toHaveBeenCalledOnce();
  });
  it('returns failure and logs sanitized errors on connection failure', async () => {
    vi.mocked(database.connectDatabase).mockRejectedValue(
      new Error('mongodb://private-user:private-password@host/db'),
    );
    expect(await runMaintenance('expire_donations')).toBe(1);
    expect(records().map((r) => r.event)).toEqual([
      'job_started',
      'job_failed',
    ]);
    expect(lines.join()).not.toMatch(/private-|mongodb:/);
    expect(database.disconnectDatabase).toHaveBeenCalledOnce();
  });
  it('returns failure when a workflow command throws', async () => {
    vi.mocked(workflow.expireDonations).mockRejectedValue(
      new Error('private-donation'),
    );
    expect(await runMaintenance('expire_donations')).toBe(1);
    expect(records().at(-1).event).toBe('job_failed');
  });
  it('returns failure on partial provider cleanup without claiming success', async () => {
    vi.mocked(images.cleanupImages).mockResolvedValue({
      removed: 1,
      failed: 2,
      pending: true,
    });
    expect(await runMaintenance('cleanup_images')).toBe(1);
    expect(records().at(-1)).toMatchObject({
      event: 'job_failed',
      removed: 1,
      failed: 2,
      pending: true,
      error: { type: 'JobFailure', code: 'JOB_PARTIAL_FAILURE' },
    });
    expect(records().some((r) => r.event === 'job_completed')).toBe(false);
  });
  it('does not treat deferred non-failing cleanup as a failure', async () => {
    vi.mocked(images.cleanupImages).mockResolvedValue({
      removed: 0,
      failed: 0,
      pending: true,
    });
    expect(await runMaintenance('cleanup_images')).toBe(0);
    expect(records().at(-1)).toMatchObject({
      event: 'job_completed',
      pending: true,
    });
  });
  it('refuses missing Cloudinary configuration before connecting', async () => {
    vi.mocked(cloud.cloudinaryEnabled).mockReturnValue(false);
    expect(await runMaintenance('cleanup_images')).toBe(1);
    expect(database.connectDatabase).not.toHaveBeenCalled();
    expect(records().at(-1).event).toBe('job_failed');
  });
  it('treats disconnect failures as job failures', async () => {
    vi.mocked(database.disconnectDatabase).mockRejectedValue(
      new Error('private-close-error'),
    );
    expect(await runMaintenance('expire_donations')).toBe(1);
    expect(records().at(-1).event).toBe('job_failed');
  });
  it('preserves failure semantics even if the log sink fails', async () => {
    const logger = createLogger({
      environment: 'production',
      write: () => {
        throw new Error('sink');
      },
    });
    await expect(
      runJob(
        'cleanup_images',
        async () => {
          throw new Error('provider');
        },
        { logger },
      ),
    ).rejects.toThrow('provider');
  });
  it.each(['expireDonations', 'cleanupImages'])(
    'the actual %s CLI exits nonzero with structured failure logs and no secret output',
    (script) => {
      let failure;
      try {
        execFileSync(
          process.execPath,
          [fileURLToPath(new URL(`../scripts/${script}.js`, import.meta.url))],
          {
            env: {
              ...process.env,
              NODE_ENV: 'production',
              RENDER: 'false',
              MONGODB_URI: '',
              CLOUDINARY_CLOUD_NAME: '',
              CLOUDINARY_API_KEY: '',
              CLOUDINARY_API_SECRET: '',
            },
            timeout: 8000,
            stdio: 'pipe',
          },
        );
      } catch (error) {
        failure = error;
      }
      expect(failure?.status).toBe(1);
      const output = `${failure.stdout}${failure.stderr}`;
      const events = output
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(events.map((r) => r.event)).toEqual(['job_started', 'job_failed']);
      expect(output).not.toMatch(/private-|job-fixture-only|mongodb:/);
    },
  );
});
