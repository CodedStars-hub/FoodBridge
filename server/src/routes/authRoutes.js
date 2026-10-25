import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authController } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
export function createAuthRoutes(config) {
  const router = Router();
  const controller = authController(config);
  const limiter = (limit) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: { message: 'Too many attempts. Please try again in 15 minutes' },
      },
    });
  router.post(
    '/register',
    limiter(config.REGISTER_RATE_LIMIT),
    controller.register,
  );
  router.post('/login', limiter(config.LOGIN_RATE_LIMIT), controller.login);
  router.get('/me', requireAuth(config), controller.me);
  router.post('/logout', requireAuth(config), controller.logout);
  return router;
}
