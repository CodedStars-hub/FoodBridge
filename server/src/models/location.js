import mongoose from 'mongoose';
export const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value) =>
          value.length === 2 &&
          value.every(Number.isFinite) &&
          value[0] >= -180 &&
          value[0] <= 180 &&
          value[1] >= -90 &&
          value[1] <= 90,
        message:
          'Coordinates must be [longitude, latitude] within valid ranges',
      },
    },
  },
  { _id: false },
);
export const optionalPoint = { type: pointSchema, default: undefined };
