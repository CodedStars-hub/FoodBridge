import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { HttpError } from '../utils/HttpError.js';
import { cookieName, verifySession } from '../services/sessionService.js';
export function requireAuth(config) {
  return async (req, _res, next) => {
    const token = req.cookies[cookieName(config)];
    if (!token) throw new HttpError(401, 'Authentication required');
    let claims;
    try {
      claims = verifySession(token, config);
    } catch {
      throw new HttpError(401, 'Your session has expired. Please log in again');
    }
    if (
      !mongoose.isObjectIdOrHexString(claims.sub) ||
      !Number.isInteger(claims.version)
    )
      throw new HttpError(401, 'Invalid session');
    const user = await User.findById(claims.sub).select(
      '+tokenVersion +location +address',
    );
    if (!user || user.tokenVersion !== claims.version)
      throw new HttpError(401, 'Your session has expired. Please log in again');
    req.user = user;
    next();
  };
}
export function authorizeRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw new HttpError(401, 'Authentication required');
    if (!roles.includes(req.user.role))
      throw new HttpError(
        403,
        'You do not have permission to access this resource',
      );
    next();
  };
}
