// Logging is allowlisted, not a serialization of requests or arbitrary Error objects.
// This deliberately excludes headers, bodies, URLs/queries, identifiers and error messages/stacks.
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
  'MongooseError',
  'ValidationError',
  'JobFailure',
]);
const errorCodes = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNRESET',
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
function metadata(fields) {
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
  if (fields.error) result.error = safeError(fields.error);
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
      ...metadata(fields),
    };
    const line =
      mode === 'production'
        ? JSON.stringify(record)
        : `${record.timestamp} ${level.toUpperCase()} ${event} ${JSON.stringify(metadata(fields))}`;
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
