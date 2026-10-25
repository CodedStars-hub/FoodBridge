import { createApp } from './app.js';
import { parseEnvironment } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
async function start() {
  const config = parseEnvironment();
  const connected = await connectDatabase(config.MONGODB_URI);
  console.info(
    connected
      ? 'MongoDB connected'
      : 'MongoDB not configured; running without database features.',
  );
  const server = createApp(config).listen(config.PORT, () =>
    console.info(`FoodBridge API listening on port ${config.PORT}`),
  );
  server.on('error', () => {
    console.error('Unable to start HTTP server.');
    void disconnectDatabase().finally(() => process.exit(1));
  });
  const shutdown = () => {
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    server.close(() => {
      void disconnectDatabase()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
start().catch(() => {
  console.error(
    'Startup failed. Check environment settings and MongoDB availability.',
  );
  process.exit(1);
});
