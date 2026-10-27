import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { Donation } from '../models/Donation.js';
import { ImageCleanupTask } from '../models/ImageCleanupTask.js';
import { HttpError } from '../utils/HttpError.js';
import { logger } from '../utils/logger.js';
import {
  cloudinaryEnabled,
  imageLimits,
  uploadCloudImage,
  destroyCloudImage,
} from './cloudinaryClient.js';
export async function validateImage(file) {
  if (!file) throw new HttpError(400, 'Choose one image file');
  if (file.buffer.length > imageLimits.maxBytes)
    throw new HttpError(413, 'Image must be at most 5 MiB');
  let type;
  try {
    type = await fileTypeFromBuffer(file.buffer);
  } catch {
    throw new HttpError(
      415,
      'File contents must match JPEG, PNG or WebP MIME type',
    );
  }
  if (
    !imageLimits.formats.includes(file.mimetype) ||
    !type ||
    type.mime !== file.mimetype
  )
    throw new HttpError(
      415,
      'File contents must match JPEG, PNG or WebP MIME type',
    );
  try {
    return await sharp(file.buffer, {
      limitInputPixels: imageLimits.maxPixels,
      animated: false,
    })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new HttpError(
      400,
      'Image could not be decoded or exceeds the 20 megapixel limit',
    );
  }
}
async function queue(publicId, readyAfter = new Date(Date.now() + 3600000)) {
  if (!/^foodbridge\/donations\/[a-f0-9]{24}\/[a-f0-9-]{36}$/.test(publicId))
    throw new HttpError(
      409,
      'Image identifier is not managed by this application',
    );
  await ImageCleanupTask.updateOne(
    { publicId },
    { $setOnInsert: { attempts: 0 }, $max: { readyAfter } },
    { upsert: true },
  );
}
export async function cleanupImages(config, onlyPublicId) {
  if (!cloudinaryEnabled(config)) return { removed: 0, pending: true };
  const tasks = await ImageCleanupTask.find({
    readyAfter: { $lte: new Date() },
    ...(onlyPublicId ? { publicId: onlyPublicId } : {}),
  })
    .sort({ readyAfter: 1 })
    .limit(25);
  let removed = 0;
  let failed = 0;
  for (const task of tasks) {
    try {
      if (!(await Donation.exists({ 'image.publicId': task.publicId }))) {
        await destroyCloudImage(task.publicId, config);
        removed++;
      }
      await ImageCleanupTask.deleteOne({
        _id: task._id,
        readyAfter: task.readyAfter,
      });
    } catch (error) {
      failed++;
      logger.warn('job_item_failed', { job: 'cleanup_images', error });
      await ImageCleanupTask.updateOne(
        { _id: task._id },
        {
          $inc: { attempts: 1 },
          $set: { readyAfter: new Date(Date.now() + 60000) },
        },
      );
    }
  }
  return {
    removed,
    failed,
    pending: (await ImageCleanupTask.exists({})) !== null,
  };
}
function revisionFilter(donation) {
  return !donation.imageVersion
    ? { $or: [{ imageVersion: { $exists: false } }, { imageVersion: 0 }] }
    : { imageVersion: donation.imageVersion };
}
export async function replaceImage(donation, file, config) {
  if (!cloudinaryEnabled(config))
    throw new HttpError(
      503,
      'Image uploads are not configured. Food donation workflows remain available',
    );
  const buffer = await validateImage(file);
  const publicId = `foodbridge/donations/${donation._id}/${randomUUID()}`;
  await queue(publicId);
  let image;
  try {
    const result = await uploadCloudImage(buffer, publicId, config);
    if (
      result.public_id !== publicId ||
      URL.parse(result.secure_url)?.protocol !== 'https:'
    )
      throw new Error('Invalid provider response');
    image = {
      publicId,
      secureUrl: result.secure_url,
      format: result.format,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
      uploadedAt: new Date(),
    };
  } catch {
    await ImageCleanupTask.updateOne(
      { publicId },
      { $set: { readyAfter: new Date() } },
    );
    await cleanupImages(config, publicId).catch(() => {});
    throw new HttpError(
      502,
      'Image service unavailable. The existing donation image was preserved; please retry',
    );
  }
  try {
    if (donation.image?.publicId) await queue(donation.image.publicId);
    const updated = await Donation.findOneAndUpdate(
      { _id: donation._id, donor: donation.donor, ...revisionFilter(donation) },
      { $set: { image, imageUrl: image.secureUrl }, $inc: { imageVersion: 1 } },
      { new: true, runValidators: true },
    );
    if (!updated)
      throw new HttpError(
        409,
        'The image changed while uploading. Refresh before retrying',
      );
    // Pending new-upload cleanup also safely survives a crash: the worker checks references before deletion.
    await ImageCleanupTask.deleteOne({ publicId }).catch(() => {});
    if (donation.image?.publicId) {
      await ImageCleanupTask.updateOne(
        { publicId: donation.image.publicId },
        { $set: { readyAfter: new Date() } },
      ).catch(() => {});
      await cleanupImages(config, donation.image.publicId).catch(() => {});
    }
    return updated;
  } catch (error) {
    await ImageCleanupTask.updateOne(
      { publicId },
      { $set: { readyAfter: new Date() } },
    ).catch(() => {});
    await cleanupImages(config, publicId).catch(() => {});
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      503,
      'Image could not be attached. Please retry; donation inventory was not changed',
    );
  }
}
export async function removeImage(donation, config) {
  if (!cloudinaryEnabled(config))
    throw new HttpError(503, 'Image management is not configured');
  if (donation.image?.publicId) await queue(donation.image.publicId);
  const updated = await Donation.findOneAndUpdate(
    { _id: donation._id, donor: donation.donor, ...revisionFilter(donation) },
    { $unset: { image: 1 }, $set: { imageUrl: '' }, $inc: { imageVersion: 1 } },
    { new: true },
  );
  if (!updated)
    throw new HttpError(409, 'The image changed; refresh before deleting');
  if (donation.image?.publicId) {
    await ImageCleanupTask.updateOne(
      { publicId: donation.image.publicId },
      { $set: { readyAfter: new Date() } },
    ).catch(() => {});
    await cleanupImages(config, donation.image.publicId).catch(() => {});
  }
  return updated;
}
