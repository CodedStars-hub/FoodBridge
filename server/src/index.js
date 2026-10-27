import { createServer } from 'node:http';
import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { attachRealtime } from './services/realtimeService.js';
import { cleanupImages } from './services/imageService.js';
import { cloudinaryEnabled } from './services/cloudinaryClient.js';
import { logger } from './utils/logger.js';
import { runJob } from './utils/jobRunner.js';
async function start() {
  const config = parseEnvironment();
  const connected = await connectDatabase(config.MONGODB_URI);
  logger.info(connected ? 'database_connected' : 'database_unconfigured');
  const app = createApp(config, { logger });
  const server = createServer(app);
  const realtime = attachRealtime(server, app, config);
  let cleanupPromise;
  let cleanupTimer;
  if (cloudinaryEnabled(config)) {
    cleanupTimer = setInterval(() => {
      if (cleanupPromise) return;
      cleanupPromise = runJob('cleanup_images', async () => {
        if (!connected) throw new Error('Database unavailable');
        return cleanupImages(config);
      })
        .catch(() => {
          /* Failure already logged; durable tasks retry. */
        })
        .finally(() => {
          cleanupPromise = null;
        });
    }, 60000);
    cleanupTimer.unref();
  } else logger.info('job_skipped', { job: 'cleanup_images' });
  let stopping = false;
  const shutdown = async (exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    logger.info('shutdown_started');
    clearInterval(cleanupTimer);
    const timeout = setTimeout(() => {
      logger.error('shutdown_failed');
      process.exit(1);
    }, 10000);
    timeout.unref();
    try {
      await realtime.close();
      await cleanupPromise;
      await disconnectDatabase();
      logger.info('shutdown_completed');
      process.exit(exitCode);
    } catch (error) {
      logger.error('shutdown_failed', { error });
      process.exit(1);
    }
  };
  server.once('error', (error) => {
    logger.error('server_failed', { error });
    void shutdown(1);
  });
  server.listen(config.PORT, () => logger.info('server_started'));
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}
start().catch(async (error) => {
  logger.error('server_failed', { error });
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
