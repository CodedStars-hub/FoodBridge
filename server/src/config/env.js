import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { parseTrustedProxies } from './proxy.js';
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
  UPSTASH_REDIS_REST_URL: z
    .string()
    .default('')
    .refine((value) => {
      if (!value) return true;
      const url = URL.parse(value);
      return (
        !!url &&
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (url.pathname === '/' || url.pathname === '')
      );
    }, 'Must be an HTTPS REST origin'),
  UPSTASH_REDIS_REST_TOKEN: z.string().trim().default(''),
  RATE_LIMIT_STORE: z.enum(['auto', 'redis', 'process-demo']).default('auto'),
  DEMO_SINGLE_PROCESS: z.enum(['true', 'false']).default('false'),
  RATE_LIMIT_NAMESPACE: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,64}$/)
    .default('foodbridge'),
  TRUSTED_PROXY_CIDRS: z.string().default(''),
  CLIENT_IP_SOURCE: z.enum(['express', 'socket', 'vercel']).default('express'),
  VERCEL: z.enum(['0', '1']).default('0'),
  RENDER: z.enum(['true', 'false']).default('false'),
  RENDER_SERVICE_TYPE: z.string().optional(),
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
  CLOUDINARY_CLOUD_NAME: z.string().trim().default(''),
  CLOUDINARY_API_KEY: z.string().trim().default(''),
  CLOUDINARY_API_SECRET: z.string().trim().default(''),
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
  if (!!config.UPSTASH_REDIS_REST_URL !== !!config.UPSTASH_REDIS_REST_TOKEN)
    throw new Error(
      'Shared rate limiting requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN',
    );
  config.TRUSTED_PROXY_CIDRS = parseTrustedProxies(config.TRUSTED_PROXY_CIDRS);
  if (config.CLIENT_IP_SOURCE === 'socket' && config.TRUSTED_PROXY_CIDRS.length)
    throw new Error('Socket-only client handling must not trust proxy CIDRs');
  if (config.RATE_LIMIT_STORE === 'process-demo') {
    const conflicts = [
      ...(config.NODE_ENV !== 'production' ? ['NODE_ENV'] : []),
      ...(config.RENDER !== 'true' ? ['RENDER'] : []),
      ...(config.VERCEL === '1' ? ['VERCEL'] : []),
      ...(config.DEMO_SINGLE_PROCESS !== 'true' ? ['DEMO_SINGLE_PROCESS'] : []),
      ...(config.CLIENT_IP_SOURCE !== 'socket' ? ['CLIENT_IP_SOURCE'] : []),
      ...(config.UPSTASH_REDIS_REST_URL ? ['UPSTASH_REDIS_REST_URL'] : []),
      ...(config.UPSTASH_REDIS_REST_TOKEN ? ['UPSTASH_REDIS_REST_TOKEN'] : []),
    ];
    if (conflicts.length)
      throw new Error(
        `Invalid environment configuration: ${conflicts.join(', ')}`,
      );
  }
  if (
    config.CLIENT_IP_SOURCE === 'vercel' &&
    (config.NODE_ENV !== 'production' ||
      config.VERCEL !== '1' ||
      config.RENDER === 'true' ||
      config.TRUSTED_PROXY_CIDRS.length)
  )
    throw new Error(
      'Vercel client IP handling requires an exclusive production Vercel runtime',
    );
  if (
    config.NODE_ENV === 'production' &&
    config.RENDER === 'true' &&
    (!config.RENDER_SERVICE_TYPE || config.RENDER_SERVICE_TYPE === 'web') &&
    !config.TRUSTED_PROXY_CIDRS.length &&
    config.CLIENT_IP_SOURCE !== 'socket'
  )
    throw new Error('Render web services require verified TRUSTED_PROXY_CIDRS');
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
