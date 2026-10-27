import { isIP } from 'node:net';
import proxyaddr from 'proxy-addr';

export function parseTrustedProxies(value = '') {
  if (!value.trim()) return [];
  const ranges = value.split(',').map((part) => part.trim());
  if (
    ranges.length > 32 ||
    ranges.some((range) => {
      const [address, prefix, extra] = range.split('/');
      const family = isIP(address);
      return (
        !family ||
        extra !== undefined ||
        (prefix !== undefined &&
          (!/^\d+$/.test(prefix) ||
            Number(prefix) < (family === 4 ? 8 : 32) ||
            Number(prefix) > (family === 4 ? 32 : 128)))
      );
    })
  )
    throw new Error('Invalid environment configuration: TRUSTED_PROXY_CIDRS');
  // Validate using the same parser Express uses. Never accept aliases, booleans or hop counts.
  try {
    proxyaddr.compile(ranges);
  } catch {
    throw new Error('Invalid environment configuration: TRUSTED_PROXY_CIDRS');
  }
  return ranges;
}

export function trustedProxy(config) {
  const ranges = config.TRUSTED_PROXY_CIDRS || [];
  return ranges.length ? proxyaddr.compile(ranges) : false;
}
