import { Router } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { sharedRateLimitStore } from '../stores/redisRateLimitStore.js';
import { clientAddress } from '../config/proxy.js';
import { authController } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
export function createAuthRoutes(config) {
  const router = Router();
  const controller = authController(config);
  const limiter = (limit, scope) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit,
      store: sharedRateLimitStore(config, scope),
      passOnStoreError: false,
      // Preserve IPv6 /56 grouping. Invalid Vercel headers share a restrictive bucket;
      // never fall back to a caller-controlled forwarding header or random identifier.
      keyGenerator: (req) => {
        // Render's actual client chain is unverified: one conservative budget for all
        // visitors, not one spoofable key per forwarded header or changing proxy peer.
        if (config.CLIENT_IP_SOURCE === 'socket') return 'render-demo-shared';
        const address = clientAddress(req, config);
        return address ? ipKeyGenerator(address) : 'unidentified-vercel-client';
      },
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: { message: 'Too many attempts. Please try again in 15 minutes' },
      },
    });
  router.post(
    '/register',
    limiter(config.REGISTER_RATE_LIMIT, 'register'),
    controller.register,
  );
  router.post(
    '/login',
    limiter(config.LOGIN_RATE_LIMIT, 'login'),
    controller.login,
  );
  router.get('/me', requireAuth(config), controller.me);
  router.post('/logout', requireAuth(config), controller.logout);
  return router;
}
