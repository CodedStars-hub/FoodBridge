import mongoose from 'mongoose';
import { User } from '../models/User.js';
export async function connectDatabase(uri) {
  if (!uri) return false;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await User.init();
  return true;
}
export async function disconnectDatabase() {
  await mongoose.disconnect();
}
