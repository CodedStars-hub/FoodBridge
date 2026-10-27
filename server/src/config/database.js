import mongoose from 'mongoose';
import { tagStartupFailure } from '../utils/startupDiagnostics.js';
import { Notification } from '../models/Notification.js';
import { ImageCleanupTask } from '../models/ImageCleanupTask.js';
import { Donation } from '../models/Donation.js';
import { DonationRequest } from '../models/DonationRequest.js';
import { User } from '../models/User.js';
// A single in-flight initialization is shared by concurrent requests in one instance.
// Keep the pool alive between Function invocations; explicit shutdown is for local/CLI hosts.
let connectionPromise;
let connectionUri;
const poolOptions = {
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 5,
  minPoolSize: 0,
  maxIdleTimeMS: 60000,
  waitQueueTimeoutMS: 5000,
};
export async function connectDatabase(uri, { onStage = () => {} } = {}) {
  if (!uri) return false;
  if (connectionUri && connectionUri !== uri)
    throw new Error(
      'Database connection configuration changed; restart the instance',
    );
  if (connectionPromise) return connectionPromise;
  connectionUri = uri;
  connectionPromise = (async () => {
    try {
      await mongoose.connect(uri, poolOptions);
    } catch (error) {
      throw tagStartupFailure(error, 'database_connection');
    }
    onStage('database_indexes');
    await Promise.all([
      ...[User, Donation, DonationRequest, Notification, ImageCleanupTask].map(
        async (model) => {
          try {
            await model.init();
          } catch (error) {
            throw tagStartupFailure(error, 'database_indexes', model.modelName);
          }
        },
      ),
    ]);
    return true;
  })();
  try {
    return await connectionPromise;
  } catch (error) {
    // Discard failed initialization so a later call can retry, without leaking the URI.
    await mongoose.disconnect().catch(() => {});
    connectionPromise = undefined;
    connectionUri = undefined;
    throw error;
  }
}
export async function disconnectDatabase() {
  try {
    await connectionPromise;
  } finally {
    await mongoose.disconnect();
    connectionPromise = undefined;
    connectionUri = undefined;
  }
}
