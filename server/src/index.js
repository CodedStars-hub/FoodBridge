import { createServer } from 'node:http';
import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { attachRealtime } from './services/realtimeService.js';
import { cleanupImages } from './services/imageService.js';
async function start() {
  const config = parseEnvironment();
  const connected = await connectDatabase(config.MONGODB_URI);
  console.info(
    connected
      ? 'MongoDB connected'
      : 'MongoDB not configured; running without database features.',
  );
  const app = createApp(config);
  const server = createServer(app);
  const realtime = attachRealtime(server, app, config);
  let cleanupRunning = false;
  const cleanupTimer = setInterval(async () => {
    if (!connected || cleanupRunning) return;
    cleanupRunning = true;
    try {
      await cleanupImages(config);
    } catch {
      /* Durable cleanup retries later. */
    } finally {
      cleanupRunning = false;
    }
  }, 60000);
  cleanupTimer.unref();
  const shutdown = async () => {
    clearInterval(cleanupTimer);
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    try {
      await realtime.close();
      await disconnectDatabase();
      process.exit(0);
    } catch {
      process.exit(1);
    }
  };
  server.once('error', () => {
    console.error('Unable to start HTTP server.');
    void shutdown();
  });
  server.listen(config.PORT, () =>
    console.info(`FoodBridge API listening on port ${config.PORT}`),
  );
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}
start().catch(() => {
  console.error(
    'Startup failed. Check environment settings and MongoDB availability.',
  );
  process.exit(1);
});
