import { v2 as cloudinary } from 'cloudinary';
import { HttpError } from '../utils/HttpError.js';
export const imageLimits = {
  maxBytes: 5 * 1024 * 1024,
  maxPixels: 20000000,
  formats: ['image/jpeg', 'image/png', 'image/webp'],
};
export function cloudinaryEnabled(config) {
  return [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ].every((key) => !!config[key] && !/^(REPLACE_|YOUR_|<)/i.test(config[key]));
}
function configured(config) {
  if (!cloudinaryEnabled(config))
    throw new HttpError(
      503,
      'Image uploads are not configured. Food donation workflows remain available',
    );
  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
    secure: true,
  });
}
export async function uploadCloudImage(buffer, publicId, config) {
  configured(config);
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        resource_type: 'image',
        format: 'webp',
        overwrite: false,
        timeout: 30000,
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    stream.on('error', reject);
    stream.end(buffer);
  });
}
export async function destroyCloudImage(publicId, config) {
  configured(config);
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    invalidate: true,
    timeout: 30000,
  });
  if (!['ok', 'not found'].includes(result.result))
    throw new Error('Image removal unavailable');
  return result;
}
