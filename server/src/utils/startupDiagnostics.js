// Startup diagnostics are deliberately constructed, never a serialization of an
// arbitrary exception. Driver messages may embed URIs, passwords or server replies.
const configurationMessages = new Set([
  'Shared rate limiting requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN',
  'Socket-only client handling must not trust proxy CIDRs',
  'process-demo requires a single production Render process, socket-only identity, and no Redis credentials',
  'Vercel client IP handling requires an exclusive production Vercel runtime',
  'Render web services require verified TRUSTED_PROXY_CIDRS',
  'SameSite=None requires production HTTPS cookies',
  'Production client origins must use HTTPS',
  'Matching weights must sum to 100',
  'Default radius exceeds maximum radius',
  'Database connection configuration changed; restart the instance',
]);
const environmentNames = new Set([
  'NODE_ENV',
  'PORT',
  'CLIENT_ORIGIN',
  'CLIENT_ORIGINS',
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_EXPIRES_SECONDS',
  'COOKIE_SAME_SITE',
  'LOGIN_RATE_LIMIT',
  'REGISTER_RATE_LIMIT',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'RATE_LIMIT_STORE',
  'DEMO_SINGLE_PROCESS',
  'RATE_LIMIT_NAMESPACE',
  'TRUSTED_PROXY_CIDRS',
  'CLIENT_IP_SOURCE',
  'VERCEL',
  'RENDER',
  'RENDER_SERVICE_TYPE',
  'GEO_DEFAULT_RADIUS_KM',
  'GEO_MAX_RADIUS_KM',
  'MATCH_DISTANCE_WEIGHT',
  'MATCH_QUANTITY_WEIGHT',
  'MATCH_TIME_WEIGHT',
  'MATCH_PICKUP_WINDOW_MINUTES',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'JSON_BODY_LIMIT',
]);
const framePaths = new Set([
  'server/src/index.js',
  'server/src/runtime.js',
  'server/src/app.js',
  'server/src/config/env.js',
  'server/src/config/proxy.js',
  'server/src/config/database.js',
  'server/src/services/realtimeService.js',
  'server/src/services/cloudinaryClient.js',
  'server/src/services/imageService.js',
  'server/src/stores/redisRateLimitStore.js',
  'server/src/utils/startupDiagnostics.js',
  'server/src/utils/logger.js',
]);

function messageFor(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (configurationMessages.has(message)) return message;
  const prefix = 'Invalid environment configuration: ';
  if (message.startsWith(prefix)) {
    const names = message.slice(prefix.length).split(', ');
    if (names.length && names.every((name) => environmentNames.has(name)))
      return `${prefix}${names.join(', ')}`;
  }
  if (error?.code === 18 || /authentication failed|bad auth/i.test(message))
    return 'MongoDB authentication failed. Check the database user, password encoding and authSource';
  if (error?.code === 13)
    return 'MongoDB authorization failed. Check permissions for the selected database and index initialization';
  if (error?.code === 11000)
    return 'MongoDB unique-index initialization failed. Inspect conflicting demo data; do not delete real data';
  if ([85, 86].includes(error?.code))
    return 'MongoDB index definition conflicts with an existing index. Review the index configuration';
  if (error?.name === 'MongoParseError')
    return 'MongoDB URI parsing failed. Check URI format and percent-encode username/password characters';
  if (
    [
      'MongoServerSelectionError',
      'MongooseServerSelectionError',
      'MongoNetworkError',
      'MongoNetworkTimeoutError',
    ].includes(error?.name) ||
    ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error?.code)
  )
    return 'MongoDB connection failed. Check Atlas Network Access for Render outbound ranges, DNS, TLS and cluster availability';
  if (error?.code === 'EADDRINUSE')
    return 'HTTP listener address is already in use';
  if (error?.code === 'EACCES')
    return 'HTTP listener permission denied. Use the host-provided PORT';
  return 'Startup initialization failed. Inspect the reported stage and sanitized application stack';
}

export function startupDiagnostics(error) {
  // Omit the first stack line (it repeats the untrusted message), function names,
  // absolute paths, dependency frames and arbitrary source names. Keep only known
  // application file locations so bare secrets cannot leak via regex redaction gaps.
  const frames = [];
  for (const line of (typeof error?.stack === 'string' ? error.stack : '')
    .split('\n')
    .slice(0, 40)) {
    if (!/^\s*at\s/.test(line)) continue;
    const match = line.match(
      /(?:^|\/)(server\/src\/[a-zA-Z0-9_./-]+\.js):(\d{1,7}):(\d{1,5})(?:\)|\s*$)/,
    );
    if (match && framePaths.has(match[1]))
      frames.push(`at ${match[1]}:${match[2]}:${match[3]}`);
    if (frames.length === 8) break;
  }
  return {
    message: messageFor(error),
    stack: frames.join('\n') || '[no safe application frames]',
  };
}

export function tagStartupFailure(error, stage, model) {
  const failure =
    error instanceof Error ? error : new Error('Startup initialization failed');
  failure.startupStage = stage;
  if (model) failure.startupModel = model;
  return failure;
}
