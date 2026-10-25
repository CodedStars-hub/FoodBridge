import mongoose from 'mongoose';
import { Donation } from '../models/Donation.js';
import { DonationRequest } from '../models/DonationRequest.js';
import { User } from '../models/User.js';
export async function connectDatabase(uri) {
  if (!uri) return false;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Donation.init(), DonationRequest.init()]);
  return true;
}
export async function disconnectDatabase() {
  await mongoose.disconnect();
}
