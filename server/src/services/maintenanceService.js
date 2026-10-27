import { parseEnvironment } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { expireDonations } from './donationWorkflow.js';
import { cleanupImages } from './imageService.js';
import { cloudinaryEnabled } from './cloudinaryClient.js';
import { runJob } from '../utils/jobRunner.js';

export async function runMaintenance(job) {
  try {
    await runJob(job, async () => {
      try {
        const config = parseEnvironment();
        if (
          !config.MONGODB_URI ||
          (job === 'cleanup_images' && !cloudinaryEnabled(config))
        )
          throw new Error('Required configuration unavailable');
        await connectDatabase(config.MONGODB_URI);
        if (job === 'expire_donations')
          return { expiredCount: await expireDonations() };
        if (job === 'cleanup_images') return await cleanupImages(config);
        throw new Error('Unknown maintenance job');
      } finally {
        await disconnectDatabase();
      }
    });
    return 0;
  } catch {
    return 1;
  }
}
