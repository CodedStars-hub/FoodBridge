import { HttpError } from '../utils/HttpError.js';
export function csrfProtection(config) {
  return (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (
      !config.CLIENT_ORIGINS.includes(req.get('origin')) ||
      req.get('x-csrf-protection') !== 'foodbridge' ||
      !(
        req.is('application/json') ||
        (req.method === 'POST' &&
          /^\/api\/donations\/[a-f0-9]{24}\/image\/?$/i.test(
            req.originalUrl.split('?')[0],
          ) &&
          req.is('multipart/form-data'))
      )
    ) {
      throw new HttpError(403, 'Request origin or CSRF protection is invalid');
    }
    next();
  };
}
