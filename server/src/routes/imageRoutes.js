import { Router } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth, authorizeRoles } from '../middleware/auth.js';
import { validId } from '../controllers/donationController.js';
import { ImageCleanupTask } from '../models/ImageCleanupTask.js';
import { Donation } from '../models/Donation.js';
import { HttpError } from '../utils/HttpError.js';
import { validate } from '../utils/validation.js';
import {
  cloudinaryEnabled,
  imageLimits,
} from '../services/cloudinaryClient.js';
import { replaceImage, removeImage } from '../services/imageService.js';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: imageLimits.maxBytes, files: 1, fields: 0, parts: 1 },
  fileFilter: (_req, file, next) =>
    next(
      imageLimits.formats.includes(file.mimetype)
        ? null
        : new HttpError(415, 'Only JPEG, PNG and WebP images are supported'),
      imageLimits.formats.includes(file.mimetype),
    ),
}).single('file');
export function createImageRoutes(config) {
  const router = Router();

  router.param('id', validId);
  router.use(
    '/:id/image',
    requireAuth(config),
    authorizeRoles('donor'),
    async (req, _res, next) => {
      const donation = await Donation.findById(req.params.id);
      if (!donation) throw new HttpError(404, 'Donation not found');
      if (String(donation.donor) !== String(req.user._id))
        throw new HttpError(
          403,
          'Only the donation owner may manage its image',
        );
      if (!cloudinaryEnabled(config))
        throw new HttpError(
          503,
          'Image uploads are not configured. Food donation workflows remain available',
        );
      req.imageDonation = donation;
      next();
    },
  );
  router.post(
    '/:id/image',
    rateLimit({
      windowMs: 15 * 60000,
      limit: 30,
      keyGenerator: (req) => String(req.user._id),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: { message: 'Too many image uploads; please try again later' },
      },
    }),
    (req, res, next) =>
      upload(req, res, (error) => {
        if (error) {
          if (error instanceof multer.MulterError)
            return next(
              new HttpError(
                error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
                error.code === 'LIMIT_FILE_SIZE'
                  ? 'Image must be at most 5 MiB'
                  : 'Upload exactly one file named file and no additional fields',
              ),
            );
          return next(error);
        }
        next();
      }),
    async (req, res) => {
      const donation = await replaceImage(req.imageDonation, req.file, config);
      res
        .status(200)
        .json({ image: donation.image, imageUrl: donation.imageUrl });
    },
  );
  router.delete('/:id/image', async (req, res) => {
    validate(z.strictObject({}), req.body);
    const donation = await removeImage(req.imageDonation, config);
    res.json({
      image: null,
      imageUrl: donation.imageUrl,
      cleanupPending: !!(
        req.imageDonation.image?.publicId &&
        (await ImageCleanupTask.exists({
          publicId: req.imageDonation.image.publicId,
        }))
      ),
    });
  });
  return router;
}
