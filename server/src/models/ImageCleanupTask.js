import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, unique: true },
    readyAfter: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true, bufferCommands: false },
);
export const ImageCleanupTask = mongoose.model('ImageCleanupTask', schema);
