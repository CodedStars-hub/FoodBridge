import { parseEnvironment } from './config/env.js';
import { disconnectDatabase } from './config/database.js';
import { createRuntime } from './runtime.js';
import { logger } from './utils/logger.js';

let startupStage = 'environment';
function onStage(stage) {
  startupStage = stage;
  logger.info('startup_step', { stage });
}
async function start() {
  onStage('environment');
  const config = parseEnvironment();
  if (config.RATE_LIMIT_STORE === 'process-demo')
    logger.warn('demo_rate_limit_mode');
  const runtime = await createRuntime(config, { logger, onStage });
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
      logger.error('shutdown_failed', { error, stage: 'shutdown' });
      process.exit(1);
    }
  };
  runtime.server.once('error', (error) => {
    logger.error('server_failed', {
      error,
      stage: error.startupStage || startupStage,
    });
    void shutdown(1);
  });
  onStage('listen');
  runtime.server.listen(config.PORT, '0.0.0.0', () =>
    logger.info('server_started'),
  );
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}
start().catch(async (error) => {
  logger.error('server_failed', {
    error,
    stage: error.startupStage || startupStage,
  });
  await disconnectDatabase().catch(() => {});
  process.exit(1);
});
