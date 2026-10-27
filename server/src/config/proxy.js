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
  if (['vercel', 'socket'].includes(config.CLIENT_IP_SOURCE)) return false;
  const ranges = config.TRUSTED_PROXY_CIDRS || [];
  return ranges.length ? proxyaddr.compile(ranges) : false;
}

// Trust this header only behind Vercel's documented overwrite boundary, never in local/Render mode.
// Do not interpret XFF chains, Forwarded, X-Real-IP, or caller-supplied platform markers.
export function clientAddress(req, config) {
  if (config.CLIENT_IP_SOURCE === 'socket') return req.socket.remoteAddress;
  if (config.CLIENT_IP_SOURCE === 'vercel') {
    const value = req.get('x-vercel-forwarded-for');
    return typeof value === 'string' && isIP(value) ? value : null;
  }
  return isIP(req.ip) ? req.ip : req.socket.remoteAddress;
}
