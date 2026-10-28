import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, authorizeRoles } from '../middleware/auth.js';
import { validId } from '../controllers/donationController.js';
import { User } from '../models/User.js';
import { validate } from '../utils/validation.js';
import { HttpError } from '../utils/HttpError.js';
const querySchema = z.strictObject({
  status: z.enum(['pending', 'verified', 'rejected']).default('pending'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
export function createAdminRoutes(config) {
  const router = Router();
  router.use(requireAuth(config), authorizeRoles('admin'));
  router.param('id', validId);
  router.get('/verifications', async (req, res) => {
    const { status, page } = validate(querySchema, req.query);
    const filter = {
      role: { $in: ['ngo', 'volunteer'] },
      verificationStatus: status,
    };
    const [items, total] = await Promise.all([
      User.find(filter)
        .select(
          'name email role organizationName phone verificationStatus createdAt',
        )
        .sort({ createdAt: 1, _id: 1 })
        .skip((page - 1) * 20)
        .limit(20),
      User.countDocuments(filter),
    ]);
    res.json({
      items,
      pagination: { page, limit: 20, total, pages: Math.ceil(total / 20) },
    });
  });
  router.patch('/verifications/:id', async (req, res) => {
    const { status, previousStatus } = validate(
      z.strictObject({
        status: z.enum(['verified', 'rejected']),
        previousStatus: z.enum(['pending', 'verified', 'rejected']),
      }),
      req.body,
    );
    const user = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        role: { $in: ['ngo', 'volunteer'] },
        verificationStatus: previousStatus,
      },
      { $set: { verificationStatus: status } },
      { new: true, runValidators: true },
    ).select(
      'name email role organizationName phone verificationStatus createdAt',
    );
    if (!user)
      throw new HttpError(
        409,
        'Account is ineligible or its status changed. Refresh the review queue',
      );
    res.json({ user });
  });
  return router;
}
