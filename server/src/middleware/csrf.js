import { HttpError } from '../utils/HttpError.js';
export function csrfProtection(config) {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (
      !config.CLIENT_ORIGINS.includes(req.get('origin')) ||
      req.get('x-csrf-protection') !== 'foodbridge' ||
      !req.is('application/json')
    ) {
      throw new HttpError(403, 'Request origin or CSRF protection is invalid');
    }
    next();
  };
}
