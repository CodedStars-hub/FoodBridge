import mongoose from 'mongoose';
import { optionalPoint } from './location.js';
export const categories = [
  'prepared-meals',
  'produce',
  'bakery',
  'dairy',
  'packaged',
  'other',
];
export const units = [
  'servings',
  'items',
  'packs',
  'kg',
  'grams',
  'litres',
  'millilitres',
];
const text = (max) => ({
  type: String,
  required: true,
  trim: true,
  maxlength: max,
});
const count = {
  type: Number,
  required: true,
  min: 0,
  max: 1000000,
  validate: Number.isSafeInteger,
};
const schema = new mongoose.Schema(
  {
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: text(120),
    category: { type: String, enum: categories, required: true },
    description: text(2000),
    quantity: { ...count, min: 1 },
    unit: { type: String, enum: units, required: true },
    remainingQuantity: count,
    reservedQuantity: { ...count, default: 0 },
    completedQuantity: { ...count, default: 0 },
    preparationTime: { type: Date, required: true },
    pickupDeadline: { type: Date, required: true, index: true },
    storageConditions: text(500),
    packagingDetails: text(500),
    handlingDetails: text(500),
    allergenInformation: text(500),
    pickupLocation: text(500),
    location: optionalPoint,
    image: {
      type: new mongoose.Schema(
        {
          publicId: { type: String, required: true },
          secureUrl: { type: String, required: true },
          format: String,
          bytes: Number,
          width: Number,
          height: Number,
          uploadedAt: Date,
        },
        { _id: false },
      ),
      default: undefined,
    },
    imageVersion: { type: Number, default: 0 },
    imageUrl: { type: String, default: '', maxlength: 2048 },
    status: {
      type: String,
      enum: ['available', 'reserved', 'completed', 'cancelled', 'expired'],
      default: 'available',
      index: true,
    },
    workflowVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true, bufferCommands: false },
);
schema.pre('validate', function () {
  if (
    this.quantity !==
    this.remainingQuantity + this.reservedQuantity + this.completedQuantity
  )
    this.invalidate('quantity', 'Inventory totals must match quantity');
  if (this.pickupDeadline <= this.preparationTime)
    this.invalidate('pickupDeadline', 'Pickup must follow preparation');
});
schema.index({ status: 1, pickupDeadline: 1, createdAt: -1 });
schema.index({ location: '2dsphere' });
schema.index({ donor: 1, createdAt: -1 });
schema.index({ createdAt: -1, status: 1 });
export const Donation = mongoose.model('Donation', schema);
