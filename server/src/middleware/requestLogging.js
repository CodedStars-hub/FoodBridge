import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
export function requestLogging(logger) {
  return (req, res, next) => {
    req.requestId = randomUUID(); // Never trust a caller's request-ID/log fields.
    res.set('X-Request-ID', req.requestId);
    const started = performance.now();
    let logged = false;
    const complete = () => {
      if (logged) return;
      logged = true;
      logger.info('http_request', {
        requestId: req.requestId,
        route: req.route
          ? `${res.locals.routeBase || ''}${req.route.path}`
          : 'unmatched',
        method: req.method,
        status: res.writableFinished ? res.statusCode : 499,
        durationMs: Math.round((performance.now() - started) * 100) / 100,
      });
    };
    res.once('finish', complete);
    res.once('close', complete);
    next();
  };
}
