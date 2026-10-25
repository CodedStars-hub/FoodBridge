import { z } from 'zod';
import { geoPoint } from './locationValidation.js';
import { categories, units } from '../models/Donation.js';
import { requestStatuses } from '../models/DonationRequest.js';
export const plainText = (max) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        !/[<>]/.test(value) &&
        [...value].every(
          (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127,
        ),
      'Use plain text without markup or control characters',
    );
const date = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));
export const donationFields = z.strictObject({
  title: plainText(120),
  category: z.enum(categories),
  description: plainText(2000),
  quantity: z.number().int().positive().max(1000000),
  unit: z.enum(units),
  preparationTime: date,
  pickupDeadline: date,
  storageConditions: plainText(500),
  packagingDetails: plainText(500),
  handlingDetails: plainText(500),
  allergenInformation: plainText(500),
  pickupLocation: plainText(500),
  location: geoPoint.nullable().optional(),
  imageUrl: z
    .union([
      z.literal(''),
      z
        .url()
        .max(2048)
        .refine(
          (value) => URL.parse(value)?.protocol === 'https:',
          'Use an HTTPS image URL',
        ),
    ])
    .optional(),
});
export const createDonationSchema = donationFields
  .refine((value) => value.preparationTime <= new Date(), {
    path: ['preparationTime'],
    message: 'Preparation cannot be in the future',
  })
  .refine(
    (value) =>
      value.pickupDeadline > new Date() &&
      value.pickupDeadline > value.preparationTime,
    {
      path: ['pickupDeadline'],
      message: 'Pickup must be in the future and after preparation',
    },
  );
export const editDonationSchema = donationFields
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide a field to update',
  );
export const createRequestSchema = z.strictObject({
  requestedQuantity: z.number().int().positive().max(1000000),
  message: plainText(1000).or(z.literal('')).optional(),
});
export const actionSchema = z.strictObject({
  action: z.enum(['accept', 'reject', 'cancel', 'handover', 'receive']),
});
const page = z.coerce.number().int().min(1).max(10000).default(1);
const limit = z.coerce.number().int().min(1).max(50).default(12);
export const donationQuerySchema = z.strictObject({
  page,
  limit,
  category: z.enum(categories).optional(),
  unit: z.enum(units).optional(),
  q: z
    .string()
    .trim()
    .max(100)
    .refine(
      (value) =>
        [...value].every(
          (c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127,
        ),
      'Search must not contain control characters',
    )
    .optional(),
  status: z
    .enum(['available', 'reserved', 'completed', 'cancelled', 'expired'])
    .optional(),
});
export const requestQuerySchema = z.strictObject({
  page,
  limit,
  status: z.enum(requestStatuses).optional(),
});
