// Test-only atomic REST boundary model. This is not a Redis/Lua interpreter or a
// production fallback; live provider EVAL/expiry still needs operator verification.
export function redisRestFixture() {
  const counters = new Map();
  const requests = [];
  let clock = 1000000;
  return {
    counters,
    requests,
    advance(ms) {
      clock += ms;
    },
    async fetch(url, options) {
      requests.push({ url, ...options });
      const [command, script, keyCount, key, window] = JSON.parse(options.body);
      if (command !== 'EVAL' || keyCount !== '1')
        throw new Error('Unexpected fixture command');
      if (
        !script.includes("redis.call('INCR', KEYS[1])") ||
        !script.includes("redis.call('PEXPIRE', KEYS[1], ARGV[1])")
      )
        throw new Error('Expected a single atomic increment/expiry script');
      let row = counters.get(key);
      if (!row || row.expiresAt <= clock) {
        row = { hits: 0, expiresAt: clock + Number(window) };
        counters.set(key, row);
      }
      row.hits++;
      return {
        ok: true,
        json: async () => ({ result: [row.hits, row.expiresAt - clock] }),
      };
    },
  };
}
export const redisFixtureEnvironment = {
  UPSTASH_REDIS_REST_URL: 'https://isolated-rate-limit.example.test',
  UPSTASH_REDIS_REST_TOKEN: 'isolated-rest-fixture-not-a-real-token',
  RATE_LIMIT_NAMESPACE: 'isolated-tests',
};
