import { createServer } from 'node:http';
import { createApp } from './app.js';
import { connectDatabase } from './config/database.js';
import { attachRealtime } from './services/realtimeService.js';
import { cleanupImages } from './services/imageService.js';
import { cloudinaryEnabled } from './services/cloudinaryClient.js';
import { createLogger } from './utils/logger.js';
import { runJob } from './utils/jobRunner.js';

// Shared HTTP/Socket.IO runtime. Listening and process lifecycle belong to the host.
export async function createRuntime(
  config,
  {
    logger = createLogger({ environment: config.NODE_ENV }),
    onStage = () => {},
  } = {},
) {
  onStage('database_connection');
  const connected = await connectDatabase(config.MONGODB_URI, { onStage });
  logger.info(connected ? 'database_connected' : 'database_unconfigured');
  onStage('application');
  const app = createApp(config, { logger });
  const server = createServer(app);
  onStage('socket_io');
  const realtime = attachRealtime(server, app, config);
  onStage('maintenance');
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
  return {
    app,
    server,
    async close() {
      clearInterval(cleanupTimer);
      await realtime.close();
      await cleanupPromise;
    },
  };
}
