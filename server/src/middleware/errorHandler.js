import { HttpError } from '../utils/HttpError.js';
export function notFound(_req, _res, next) {
  next(new HttpError(404, 'Route not found'));
}
export function errorHandler(error, _req, res, _next) {
  if (error.code === 11000) {
    res.status(409).json({
      error: { message: 'An account with this email already exists' },
    });
    return;
  }
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
      ? error.status
      : 500;
  let message =
    status >= 500 && !(error instanceof HttpError)
      ? 'Internal server error'
      : error.message;
  if (error.type === 'entity.parse.failed') message = 'Invalid JSON body';
  if (error.type === 'entity.too.large') message = 'Request body too large';
  res.status(status).json({
    error: {
      message,
      ...(status === 400 && error.fields ? { fields: error.fields } : {}),
    },
  });
}
