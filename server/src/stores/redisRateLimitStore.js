import { createHmac } from 'node:crypto';
import { HttpError } from '../utils/HttpError.js';

// One atomic operation creates/increments the counter and sets its fixed window.
// Redis, not the Function's clock, owns expiry. No read/modify/write race or retry.
export const incrementScript = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if hits == 1 or ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {hits, ttl}
`;
const decrementScript = `
local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
if hits > 0 then redis.call('DECR', KEYS[1]) end
return 0
`;

export class RedisRateLimitStore {
  localKeys = false;
  constructor(config, scope, { fetch: transport = globalThis.fetch } = {}) {
    this.config = config;
    this.transport = transport;
    this.prefix = `foodbridge:${config.RATE_LIMIT_NAMESPACE}:${scope}:`;
  }
  init({ windowMs }) {
    this.windowMs = windowMs;
  }
  key(identity) {
    // Keep raw IPs and user IDs out of provider keys. Every instance uses the same key.
    const digest = createHmac('sha256', this.config.JWT_SECRET)
      .update(`foodbridge-rate-limit:${identity}`)
      .digest('hex');
    return `${this.prefix}${digest}`;
  }
  async command(args) {
    try {
      if (
        !this.config.UPSTASH_REDIS_REST_URL ||
        !this.config.UPSTASH_REDIS_REST_TOKEN
      )
        throw new Error('Shared limiter unconfigured');
      const response = await this.transport(
        this.config.UPSTASH_REDIS_REST_URL,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.UPSTASH_REDIS_REST_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(args),
          signal: AbortSignal.timeout(3000),
          redirect: 'error',
          cache: 'no-store',
        },
      );
      if (!response.ok) throw new Error('Shared limiter unavailable');
      const data = await response.json();
      if (data.error || !Object.hasOwn(data, 'result'))
        throw new Error('Invalid store response');
      return data.result;
    } catch {
      // Do not log provider bodies/URLs/tokens, retry ambiguous writes, or fail open.
      throw new HttpError(
        503,
        'Request throttling is temporarily unavailable. Please retry shortly',
      );
    }
  }
  async increment(identity) {
    const result = await this.command([
      'EVAL',
      incrementScript,
      '1',
      this.key(identity),
      String(this.windowMs),
    ]);
    if (
      !Array.isArray(result) ||
      result.length !== 2 ||
      !Number.isSafeInteger(result[0]) ||
      result[0] < 1 ||
      !Number.isSafeInteger(result[1]) ||
      result[1] < 0 ||
      result[1] > this.windowMs
    )
      throw new HttpError(
        503,
        'Request throttling is temporarily unavailable. Please retry shortly',
      );
    return {
      totalHits: result[0],
      resetTime: new Date(Date.now() + result[1]),
    };
  }
  async decrement(identity) {
    await this.command(['EVAL', decrementScript, '1', this.key(identity)]);
  }
  async resetKey(identity) {
    await this.command(['DEL', this.key(identity)]);
  }
}

export function sharedRateLimitStore(config, scope) {
  // Explicit single-instance demo opt-in keeps a real process-local limiter.
  // Validation requires a single-process acknowledgement; host cardinality is an operator check.
  if (config.RATE_LIMIT_STORE === 'process-demo') return undefined;
  // Production never silently falls back to a process-local budget. If unconfigured,
  // the store returns 503 on limited operations; health/session reads remain available.
  return config.RATE_LIMIT_STORE === 'redis' ||
    config.NODE_ENV === 'production' ||
    config.UPSTASH_REDIS_REST_URL
    ? new RedisRateLimitStore(config, scope)
    : undefined;
}
