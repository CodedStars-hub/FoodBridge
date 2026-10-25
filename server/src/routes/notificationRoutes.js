import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { Notification } from '../models/Notification.js';
import { validate } from '../utils/validation.js';
import { validId } from '../controllers/donationController.js';
import { HttpError } from '../utils/HttpError.js';
import {
  emitInboxChange,
  notificationView,
} from '../services/notificationService.js';
const querySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  unread: z.enum(['true', 'false']).optional(),
});
export function createNotificationRoutes(config) {
  const router = Router();
  router.use(requireAuth(config));
  router.param('id', validId);
  router.get('/', async (req, res) => {
    const query = validate(querySchema, req.query);
    const filter = {
      recipient: req.user._id,
      ...(query.unread === 'true' ? { readAt: null } : {}),
    };
    const [items, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: req.user._id, readAt: null }),
    ]);
    res.json({
      items: items.map(notificationView),
      unreadCount,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    });
  });
  router.patch('/read-all', async (req, res) => {
    validate(z.strictObject({}), req.body);
    await Notification.updateMany(
      { recipient: req.user._id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    emitInboxChange(req.app.get('io'), req.user._id);
    res.json({ unreadCount: 0 });
  });
  router.patch('/:id/read', async (req, res) => {
    validate(z.strictObject({}), req.body);
    const item = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user._id,
    });
    if (!item) throw new HttpError(404, 'Notification not found');
    if (!item.readAt) {
      item.readAt = new Date();
      await item.save();
    }
    emitInboxChange(req.app.get('io'), req.user._id);
    res.json({ notification: notificationView(item) });
  });
  return router;
}
