import { z } from 'zod';
import { units, categories } from '../models/Donation.js';
import { pickupStatuses } from '../models/pickup.js';
export const geoPoint = z.strictObject({
  type: z.literal('Point'),
  coordinates: z.tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
  ]),
});
const coordinate = (min, max) =>
  z.string().trim().min(1).pipe(z.coerce.number().min(min).max(max));
export const discoveryQuery = z
  .strictObject({
    longitude: coordinate(-180, 180).optional(),
    latitude: coordinate(-90, 90).optional(),
    radiusKm: z
      .string()
      .trim()
      .min(1)
      .pipe(z.coerce.number().positive())
      .optional(),
    quantity: z
      .string()
      .trim()
      .min(1)
      .pipe(z.coerce.number().int().min(1).max(1000000))
      .optional(),
    unit: z.enum(units).optional(),
    category: z.enum(categories).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
  })
  .refine((v) => (v.longitude === undefined) === (v.latitude === undefined), {
    message: 'Provide both longitude and latitude',
    path: ['longitude'],
  });
export const pickupActionSchema = z
  .strictObject({
    action: z.enum(['start', 'release', 'cancel', 'report_failure', 'arrive']),
    reason: z
      .string()
      .trim()
      .max(1000)
      .refine((v) => !/[<>]/.test(v), 'Use plain text')
      .optional(),
  })
  .refine((v) => v.action !== 'report_failure' || !!v.reason, {
    message: 'Describe the failed pickup or delivery issue',
    path: ['reason'],
  });
export const pickupListQuery = z.strictObject({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  status: z.enum(pickupStatuses).optional(),
});
