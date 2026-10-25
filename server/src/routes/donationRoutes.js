import { discoveryController } from '../controllers/discoveryController.js';
import { arrange } from '../controllers/pickupController.js';
import { Router } from 'express';
import { requireAuth, authorizeRoles } from '../middleware/auth.js';
import * as controller from '../controllers/donationController.js';
export function createDonationRoutes(config) {
  const router = Router();
  router.use(requireAuth(config));
  router.param('id', controller.validId);
  router.get('/', controller.list);
  router.get('/nearby', authorizeRoles('ngo'), discoveryController(config));
  router.get(
    '/recommendations',
    authorizeRoles('ngo'),
    discoveryController(config, true),
  );
  router.get('/mine', authorizeRoles('donor'), controller.mine);
  router.post('/', authorizeRoles('donor'), controller.create);
  router.get('/:id', controller.detail);
  router.patch('/:id', authorizeRoles('donor'), controller.edit);
  router.post('/:id/cancel', authorizeRoles('donor'), controller.cancel);
  router.post('/:id/requests', authorizeRoles('ngo'), controller.requestFood);
  return router;
}
export function createRequestRoutes(config) {
  const router = Router();
  router.use(requireAuth(config), authorizeRoles('donor', 'ngo'));
  router.param('id', controller.validId);
  router.get('/', controller.requests);
  router.get('/history', controller.requests);
  router.post('/:id/pickup', authorizeRoles('ngo'), arrange);
  router.patch('/:id', controller.changeRequest);
  return router;
}
