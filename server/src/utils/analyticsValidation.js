import { z } from 'zod';
import { validate } from './validation.js';
const date = z.iso.date();
const schema = z.strictObject({ from: date.optional(), to: date.optional() });
export function analyticsRange(input, now = new Date()) {
  const query = validate(schema, input);
  const from = query.from
    ? new Date(`${query.from}T00:00:00.000Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const last = query.to
    ? new Date(`${query.to}T00:00:00.000Z`)
    : new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
  const to = new Date(last.getTime() + 86400000);
  if (from >= to || to - from > 732 * 86400000)
    throw Object.assign(
      new Error('Choose an ordered date range of at most two years'),
      { status: 400 },
    );
  return {
    from,
    to,
    display: {
      from: from.toISOString().slice(0, 10),
      to: last.toISOString().slice(0, 10),
      timezone: 'UTC',
    },
  };
}
