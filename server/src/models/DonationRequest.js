import mongoose from 'mongoose';
import { pickupSchema } from './pickup.js';
import { units } from './Donation.js';
export const requestStatuses = [
  'pending',
  'accepted',
  'rejected',
  'cancelled',
  'handed_over',
  'completed',
  'expired',
];
const schema = new mongoose.Schema(
  {
    donation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Donation',
      required: true,
      index: true,
    },
    ngo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestedQuantity: {
      type: Number,
      required: true,
      min: 1,
      max: 1000000,
      validate: Number.isSafeInteger,
    },
    unit: { type: String, enum: units, required: true },
    status: {
      type: String,
      enum: requestStatuses,
      default: 'pending',
      index: true,
    },
    acceptedAt: Date,
    handedOverAt: Date,
    receivedAt: Date,
    notificationVersion: { type: Number, default: 0 },
    message: { type: String, trim: true, maxlength: 1000, default: '' },
    pickup: { type: pickupSchema, default: undefined },
    active: { type: Boolean, default: true },
    resolutionReason: { type: String, default: '' },
  },
  { timestamps: true, bufferCommands: false },
);
schema.index(
  { donation: 1, ngo: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
schema.index({ 'pickup.status': 1, status: 1 });
schema.index({ 'pickup.volunteer': 1, 'pickup.status': 1 });
schema.index({ ngo: 1, createdAt: -1 });
schema.index({ 'pickup.events.actor': 1, updatedAt: -1 });
schema.index({ status: 1, receivedAt: -1 });
schema.index({ 'pickup.volunteer': 1, status: 1, receivedAt: -1 });
export const DonationRequest = mongoose.model('DonationRequest', schema);
