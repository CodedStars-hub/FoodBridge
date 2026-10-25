import mongoose from 'mongoose';
import { HttpError } from '../utils/HttpError.js';
export function databaseReady(_req, _res, next) {
  if (mongoose.connection.readyState !== 1)
    throw new HttpError(
      503,
      'Account services are unavailable. Please try again later',
    );
  next();
}
