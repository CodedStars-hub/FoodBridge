import mongoose from 'mongoose';
import { optionalPoint } from './location.js';
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['donor', 'ngo', 'volunteer', 'admin'],
      required: true,
    },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    organizationName: {
      type: String,
      trim: true,
      maxlength: 150,
      required() {
        return this.role === 'ngo';
      },
      default: '',
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    location: { ...optionalPoint, select: false },
    address: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
      select: false,
    },
    tokenVersion: { type: Number, default: 0, select: false },
  },
  {
    timestamps: true,
    bufferCommands: false,
    toJSON: {
      transform(_doc, result) {
        delete result.passwordHash;
        delete result.tokenVersion;
        delete result.__v;
        return result;
      },
    },
  },
);
userSchema.index({ location: '2dsphere' });
userSchema.index({ createdAt: -1, role: 1 });
export const User = mongoose.model('User', userSchema);
