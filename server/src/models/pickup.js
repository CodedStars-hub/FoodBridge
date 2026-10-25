import mongoose from 'mongoose';
import { pointSchema } from './location.js';
export const pickupStatuses = [
  'awaiting_volunteer',
  'assigned',
  'en_route_to_pickup',
  'picked_up',
  'delivered',
  'cancelled',
];
const stopSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, maxlength: 500 },
    location: { type: pointSchema, required: true },
  },
  { _id: false },
);
const eventSchema = new mongoose.Schema(
  {
    action: String,
    status: String,
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
    reason: { type: String, maxlength: 1000, default: '' },
  },
  { _id: false },
);
export const pickupSchema = new mongoose.Schema(
  {
    status: { type: String, enum: pickupStatuses, required: true },
    volunteer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    origin: { type: stopSchema, required: true },
    destination: { type: stopSchema, required: true },
    issue: { type: String, default: '', maxlength: 1000 },
    arrivalReportedAt: Date,
    version: { type: Number, default: 0 },
    events: { type: [eventSchema], default: [] },
  },
  { _id: false },
);
