import { parseEnvironment } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { cleanupImages } from '../src/services/imageService.js';
import { cloudinaryEnabled } from '../src/services/cloudinaryClient.js';
async function run() {
  const config = parseEnvironment();
  if (!config.MONGODB_URI || !cloudinaryEnabled(config))
    throw new Error('Configuration required');
  await connectDatabase(config.MONGODB_URI);
  const result = await cleanupImages(config);
  console.info(
    `Image cleanup removed: ${result.removed}; pending tasks: ${result.pending ? 'yes' : 'no'}`,
  );
}
run()
  .catch(() => {
    console.error(
      'Image cleanup unavailable. Check database and Cloudinary configuration; safe to retry.',
    );
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
