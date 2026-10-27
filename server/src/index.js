import { parseEnvironment } from './config/env.js';
import { disconnectDatabase } from './config/database.js';
import { createRuntime } from './runtime.js';
import { logger } from './utils/logger.js';

async function start() {
  const config = parseEnvironment();
  if (config.RATE_LIMIT_STORE === 'process-demo')
    logger.warn('demo_rate_limit_mode');
  const runtime = await createRuntime(config, { logger });
  let stopping = false;
  const shutdown = async (exitCode = 0) => {
    if (stopping) return;
    stopping = true;
    logger.info('shutdown_started');
    const timeout = setTimeout(() => {
      logger.error('shutdown_failed');
      process.exit(1);
    }, 10000);
    timeout.unref();
    try {
      await runtime.close();
      await disconnectDatabase();
      logger.info('shutdown_completed');
      process.exit(exitCode);
    } catch (error) {
      logger.error('shutdown_failed', { error });
      process.exit(1);
    }
  };
  runtime.server.once('error', (error) => {
    logger.error('server_failed', { error });
    void shutdown(1);
  });
  runtime.server.listen(config.PORT, '0.0.0.0', () =>
    logger.info('server_started'),
  );
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}
start().catch(async (error) => {
  logger.error('server_failed', { error });
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
