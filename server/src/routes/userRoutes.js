import { Router } from 'express';
import { requireAuth, authorizeRoles } from '../middleware/auth.js';
import { getProfile, updateProfile } from '../controllers/userController.js';
export function createUserRoutes(config) {
  const router = Router();
  router.use(requireAuth(config));
  router.get('/me', getProfile);
  router.patch('/me', updateProfile);
  // A small protected resource validates dashboard access on the API too.
  router.get(
    '/dashboard/:role',
    (req, res, next) => authorizeRoles(req.params.role)(req, res, next),
    (req, res) =>
      res.json({
        role: req.user.role,
        message: 'Dashboard modules are coming in future milestones',
      }),
  );
  return router;
}
