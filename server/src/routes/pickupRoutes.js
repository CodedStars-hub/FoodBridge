import { Router } from 'express';
import { requireAuth, authorizeRoles } from '../middleware/auth.js';
import { validId } from '../controllers/donationController.js';
import * as controller from '../controllers/pickupController.js';
export function createPickupRoutes(config) {
  const router = Router();
  router.use(requireAuth(config), authorizeRoles('donor', 'ngo', 'volunteer'));
  router.param('id', validId);
  router.get('/available', authorizeRoles('volunteer'), controller.list);
  router.get('/mine', controller.list);
  router.get('/:id', controller.detail);
  router.post('/:id/claim', authorizeRoles('volunteer'), controller.claim);
  router.patch('/:id', controller.update);
  return router;
}
