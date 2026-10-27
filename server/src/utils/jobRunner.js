import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { logger as defaultLogger } from './logger.js';
export class JobFailure extends Error {
  constructor(stats = {}) {
    super('Job failed; retry is safe');
    this.name = 'JobFailure';
    this.code = 'JOB_PARTIAL_FAILURE';
    this.stats = stats;
  }
}
export async function runJob(job, work, { logger = defaultLogger } = {}) {
  const context = { job, runId: randomUUID() };
  const started = performance.now();
  logger.info('job_started', context);
  try {
    const stats = await work();
    if (stats?.failed > 0) throw new JobFailure(stats);
    logger.info('job_completed', {
      ...stats,
      ...context,
      durationMs: Math.round(performance.now() - started),
    });
    return stats;
  } catch (error) {
    logger.error('job_failed', {
      ...error.stats,
      ...context,
      error,
      durationMs: Math.round(performance.now() - started),
    });
    throw error;
  }
}
