import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    eventKey: { type: String, required: true, maxlength: 250 },
    type: { type: String, required: true, maxlength: 80 },
    message: { type: String, required: true, maxlength: 400 },
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'DonationRequest' },
    donation: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation' },
    readAt: { type: Date, default: null },
    broadcastAt: { type: Date, default: null },
  },
  { timestamps: true, bufferCommands: false },
);
schema.index({ recipient: 1, eventKey: 1 }, { unique: true });
schema.index({ recipient: 1, readAt: 1, createdAt: -1 });
schema.index({ recipient: 1, createdAt: -1, _id: -1 });
schema.index({ broadcastAt: 1, createdAt: 1 });
export const Notification = mongoose.model('Notification', schema);
