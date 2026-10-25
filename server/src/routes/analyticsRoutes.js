import { Router } from 'express';
import { requireAuth, authorizeRoles } from '../middleware/auth.js';
import { analyticsRange } from '../utils/analyticsValidation.js';
import { getAnalytics } from '../services/analyticsService.js';
import { HttpError } from '../utils/HttpError.js';
export function createAnalyticsRoutes(config) {
  const router = Router();
  router.use(requireAuth(config));
  router.get(
    '/:role',
    (req, res, next) => {
      if (!['donor', 'ngo', 'volunteer', 'admin'].includes(req.params.role))
        throw new HttpError(404, 'Analytics view not found');
      return authorizeRoles(req.params.role)(req, res, next);
    },
    async (req, res) =>
      res.json(await getAnalytics(req.user, analyticsRange(req.query))),
  );
  return router;
}
