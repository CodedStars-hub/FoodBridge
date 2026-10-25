import { parseEnvironment } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { expireDonations } from '../src/services/donationWorkflow.js';
async function run() {
  const config = parseEnvironment();
  if (!config.MONGODB_URI) throw new Error('Database required');
  await connectDatabase(config.MONGODB_URI);
  console.info(`Expired listings updated: ${await expireDonations()}`);
}
run()
  .catch(() => {
    console.error(
      'Expiry update failed; check database configuration. Safe to retry.',
    );
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
