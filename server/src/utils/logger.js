import { startupDiagnostics } from './startupDiagnostics.js';
// Logging is allowlisted, not a serialization of requests or arbitrary Error objects.
// Ordinary logs exclude request content and raw errors. Startup failures add only constructed
// safe messages and known application stack locations, never arbitrary exception text.
const events = new Set([
  'http_request',
  'http_error',
  'job_started',
  'job_completed',
  'job_failed',
  'job_item_failed',
  'job_skipped',
  'readiness_failed',
  'server_started',
  'startup_step',
  'demo_rate_limit_mode',
  'server_failed',
  'database_connected',
  'database_unconfigured',
  'shutdown_started',
  'shutdown_completed',
  'shutdown_failed',
  'notification_delivery_failed',
]);
const jobs = new Set([
  'expire_donations',
  'cleanup_images',
  'notification_outbox',
]);
const errorNames = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'HttpError',
  'MongoServerError',
  'MongoNetworkError',
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoParseError',
  'MongoNetworkTimeoutError',
  'MongooseError',
  'ValidationError',
  'JobFailure',
]);
const errorCodes = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNRESET',
  'EADDRINUSE',
  'EACCES',
  'JOB_PARTIAL_FAILURE',
  'DEPENDENCY_UNAVAILABLE',
]);
const routeParts = new Set([
  'api',
  'health',
  'ready',
  'auth',
  'register',
  'login',
  'logout',
  'me',
  'users',
  'dashboard',
  'donations',
  'mine',
  'nearby',
  'recommendations',
  'cancel',
  'requests',
  'history',
  'pickup',
  'pickups',
  'available',
  'claim',
  'image',
  'notifications',
  'read',
  'read-all',
  'analytics',
  ':id',
  ':role',
]);
export function safeRoute(route) {
  if (typeof route !== 'string' || !route.startsWith('/')) return 'unmatched';
  return route
    .split('/')
    .slice(0, 9)
    .map((part) => (!part || routeParts.has(part) ? part : '[redacted]'))
    .join('/');
}
export function safeError(error) {
  return {
    type: errorNames.has(error?.name) ? error.name : 'Error',
    ...(Number.isInteger(error?.code) && error.code >= 0 && error.code <= 100000
      ? { code: error.code }
      : errorCodes.has(error?.code)
        ? { code: error.code }
        : {}),
  };
}
const startupStages = new Set([
  'environment',
  'database_connection',
  'database_indexes',
  'application',
  'socket_io',
  'maintenance',
  'listen',
  'shutdown',
]);
const startupModels = new Set([
  'User',
  'Donation',
  'DonationRequest',
  'Notification',
  'ImageCleanupTask',
]);
function metadata(fields, event) {
  const result = {};
  for (const key of ['requestId', 'runId'])
    if (typeof fields[key] === 'string' && /^[a-f0-9-]{36}$/i.test(fields[key]))
      result[key] = fields[key];
  if (fields.route) result.route = safeRoute(fields.route);
  if (
    ['GET', 'POST', 'PATCH', 'DELETE', 'PUT', 'HEAD', 'OPTIONS'].includes(
      fields.method,
    )
  )
    result.method = fields.method;
  for (const key of [
    'status',
    'durationMs',
    'expiredCount',
    'removed',
    'failed',
    'sent',
  ])
    if (
      typeof fields[key] === 'number' &&
      Number.isFinite(fields[key]) &&
      fields[key] >= 0
    )
      result[key] = fields[key];
  if (typeof fields.pending === 'boolean') result.pending = fields.pending;
  if (jobs.has(fields.job)) result.job = fields.job;
  if (['startup_step', 'server_failed', 'shutdown_failed'].includes(event)) {
    if (startupStages.has(fields.stage)) result.stage = fields.stage;
    if (startupModels.has(fields.error?.startupModel))
      result.model = fields.error.startupModel;
  }
  if (fields.error) {
    result.error = safeError(fields.error);
    if (['server_failed', 'shutdown_failed'].includes(event))
      Object.assign(result.error, startupDiagnostics(fields.error));
  }
  return result;
}
export function createLogger({ environment, write } = {}) {
  const log = (level, event, fields = {}) => {
    if (!events.has(event)) return;
    const mode = environment || process.env.NODE_ENV || 'development';
    if (mode === 'test' && !write) return;
    const record = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...metadata(fields, event),
    };
    const line =
      mode === 'production'
        ? JSON.stringify(record)
        : `${record.timestamp} ${level.toUpperCase()} ${event} ${JSON.stringify(metadata(fields, event))}`;
    try {
      if (write) write(line, level);
      else if (level === 'error' || level === 'warn') console.error(line);
      else console.info(line);
    } catch {
      /* A failed logging sink must not change committed business state. */
    }
  };
  return Object.fromEntries(
    ['info', 'warn', 'error'].map((level) => [
      level,
      (event, fields) => log(level, event, fields),
    ]),
  );
}
export const logger = createLogger();
