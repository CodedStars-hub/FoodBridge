import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
dotenv.config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5001),
  CLIENT_ORIGIN: z
    .url()
    .refine((value) => {
      const url = URL.parse(value);
      return (
        !!url &&
        ['http:', 'https:'].includes(url.protocol) &&
        url.origin === value
      );
    }, 'Must be an HTTP(S) origin without a trailing slash')
    .default('http://localhost:5173'),
  MONGODB_URI: z
    .string()
    .default('')
    .refine(
      (value) => !value || /^mongodb(\+srv)?:\/\//.test(value),
      'Must be a MongoDB connection URI',
    ),
  JWT_SECRET: z
    .string()
    .min(32)
    .refine(
      (value) => !value.startsWith('REPLACE_'),
      'Generate a random secret',
    ),
  JWT_EXPIRES_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(604800)
    .default(86400),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).default(20),
  REGISTER_RATE_LIMIT: z.coerce.number().int().min(1).default(10),
  CLIENT_ORIGINS: z.string().optional(),
  GEO_DEFAULT_RADIUS_KM: z.coerce.number().positive().max(200).default(10),
  GEO_MAX_RADIUS_KM: z.coerce.number().positive().max(200).default(100),
  MATCH_DISTANCE_WEIGHT: z.coerce.number().min(0).max(100).default(40),
  MATCH_QUANTITY_WEIGHT: z.coerce.number().min(0).max(100).default(35),
  MATCH_TIME_WEIGHT: z.coerce.number().min(0).max(100).default(25),
  MATCH_PICKUP_WINDOW_MINUTES: z.coerce
    .number()
    .positive()
    .max(10080)
    .default(240),
  JSON_BODY_LIMIT: z
    .string()
    .regex(/^\d+(kb|mb|b)$/i)
    .default('100kb'),
});
export function parseEnvironment(source = process.env) {
  const result = schema.safeParse(source);
  if (!result.success) {
    // Report field names only: validation errors must never expose credentials.
    throw new Error(
      `Invalid environment configuration: ${[...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`,
    );
  }
  const config = result.data;
  config.CLIENT_ORIGINS = (config.CLIENT_ORIGINS || config.CLIENT_ORIGIN)
    .split(',')
    .map((value) => value.trim());
  if (
    config.CLIENT_ORIGINS.some((value) => {
      const url = URL.parse(value);
      return (
        !url ||
        !['http:', 'https:'].includes(url.protocol) ||
        url.origin !== value
      );
    })
  )
    throw new Error('Invalid environment configuration: CLIENT_ORIGINS');
  if (config.COOKIE_SAME_SITE === 'none' && config.NODE_ENV !== 'production')
    throw new Error('SameSite=None requires production HTTPS cookies');
  if (
    config.NODE_ENV === 'production' &&
    config.CLIENT_ORIGINS.some((value) => !value.startsWith('https://'))
  )
    throw new Error('Production client origins must use HTTPS');
  if (
    Math.abs(
      config.MATCH_DISTANCE_WEIGHT +
        config.MATCH_QUANTITY_WEIGHT +
        config.MATCH_TIME_WEIGHT -
        100,
    ) > 0.000001
  )
    throw new Error('Matching weights must sum to 100');
  if (config.GEO_DEFAULT_RADIUS_KM > config.GEO_MAX_RADIUS_KM)
    throw new Error('Default radius exceeds maximum radius');
  return config;
}
