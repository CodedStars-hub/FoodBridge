import express from 'express';
import { trustedProxy } from './config/proxy.js';
import { createLogger } from './utils/logger.js';
import { requestLogging } from './middleware/requestLogging.js';
import { createImageRoutes } from './routes/imageRoutes.js';
import { createNotificationRoutes } from './routes/notificationRoutes.js';
import { createAnalyticsRoutes } from './routes/analyticsRoutes.js';
import { createPickupRoutes } from './routes/pickupRoutes.js';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { createAuthRoutes } from './routes/authRoutes.js';
import { createUserRoutes } from './routes/userRoutes.js';
import { csrfProtection } from './middleware/csrf.js';
import { databaseReady } from './middleware/databaseReady.js';
import { parseEnvironment } from './config/env.js';
import {
  createDonationRoutes,
  createRequestRoutes,
} from './routes/donationRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
export function createApp(
  config = parseEnvironment(),
  { logger = createLogger({ environment: config.NODE_ENV }) } = {},
) {
  const app = express();
  app.set('config', config);
  app.set('logger', logger);
  app.set('trust proxy', trustedProxy(config));
  app.disable('x-powered-by');
  app.use(requestLogging(logger));
  app.use(helmet());
  app.use(cors({ origin: config.CLIENT_ORIGINS, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: config.JSON_BODY_LIMIT }));
  app.use(
    '/api/health',
    (_req, res, next) => {
      res.locals.routeBase = '/api/health';
      next();
    },
    healthRoutes,
  );
  app.use(
    '/api/auth',
    (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      res.locals.routeBase = '/api/auth';
      next();
    },
    csrfProtection(config),
    databaseReady,
    createAuthRoutes(config),
  );
  app.use(
    '/api/users',
    (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      res.locals.routeBase = '/api/users';
      next();
    },
    csrfProtection(config),
    databaseReady,
    createUserRoutes(config),
  );
  for (const [path, router] of [
    ['/api/donations', createImageRoutes(config)],
    ['/api/donations', createDonationRoutes(config)],
    ['/api/requests', createRequestRoutes(config)],
    ['/api/pickups', createPickupRoutes(config)],
    ['/api/notifications', createNotificationRoutes(config)],
    ['/api/analytics', createAnalyticsRoutes(config)],
  ]) {
    app.use(
      path,
      (_req, res, next) => {
        res.set('Cache-Control', 'no-store');
        res.locals.routeBase = path;
        next();
      },
      csrfProtection(config),
      databaseReady,
      router,
    );
  }
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
