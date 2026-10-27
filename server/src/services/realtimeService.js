import { Server } from 'socket.io';
import { parse } from 'cookie';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { cookieName, verifySession } from './sessionService.js';
import { logger as defaultLogger } from '../utils/logger.js';
import { runJob, JobFailure } from '../utils/jobRunner.js';
// Each instance reconciles only its own authenticated recipients. MongoDB is the
// durable cross-instance source, not a globally consumed broadcastAt flag.
const instanceSnapshots = new WeakMap();
export async function dispatchNotifications(
  io,
  { logger = defaultLogger, failOnError = false } = {},
) {
  if (mongoose.connection.readyState !== 1) {
    if (failOnError) throw new Error('Database unavailable');
    return 0;
  }
  let snapshots = instanceSnapshots.get(io);
  if (!snapshots) {
    snapshots = new Map();
    instanceSnapshots.set(io, snapshots);
  }
  const recipients = new Map();
  for (const socket of io.sockets.sockets.values()) {
    const id = socket.data.userId;
    if (!recipients.has(id)) recipients.set(id, []);
    recipients.get(id).push(socket);
  }
  for (const id of snapshots.keys())
    if (!recipients.has(id)) snapshots.delete(id);
  if (!recipients.size) return 0;
  let sent = 0;
  let failed = 0;
  // Bound each query while allowing more connected recipients in later batches.
  const ids = [...recipients.keys()];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    try {
      const objectIds = batch.map((id) => new mongoose.Types.ObjectId(id));
      const [users, summaries] = await Promise.all([
        User.find({ _id: { $in: objectIds } })
          .select('_id +tokenVersion')
          .maxTimeMS(3000)
          .lean(),
        Notification.aggregate([
          { $match: { recipient: { $in: objectIds } } },
          {
            $group: {
              _id: '$recipient',
              count: { $sum: 1 },
              unread: {
                $sum: {
                  $cond: [
                    { $eq: [{ $ifNull: ['$readAt', null] }, null] },
                    1,
                    0,
                  ],
                },
              },
              latest: { $max: '$_id' },
              updatedAt: { $max: '$updatedAt' },
            },
          },
        ]).option({ maxTimeMS: 3000 }),
      ]);
      const accounts = new Map(users.map((user) => [String(user._id), user]));
      const inboxes = new Map(summaries.map((row) => [String(row._id), row]));
      for (const id of batch) {
        try {
          const user = accounts.get(id);
          const sockets = recipients.get(id);
          let eligible = false;
          for (const socket of sockets) {
            if (
              !user ||
              socket.data.version !== user.tokenVersion ||
              socket.data.expiresAt <= Date.now()
            )
              socket.disconnect(true);
            else eligible = true;
          }
          if (!eligible) {
            snapshots.delete(id);
            continue;
          }
          const row = inboxes.get(id);
          const signature = JSON.stringify(
            row ? [row.count, row.unread, row.latest, row.updatedAt] : [],
          );
          if (snapshots.get(id) !== signature) {
            // Empty first connection already receives notifications:sync. Repeated hints
            // invalidate the same ID-keyed inbox; they never append notification items.
            if (row || snapshots.has(id)) {
              io.to(`user:${id}`).emit('notifications:changed', {});
              sent++;
            }
            snapshots.set(id, signature);
          }
        } catch (error) {
          failed++;
          logger.warn('job_item_failed', { job: 'notification_outbox', error });
          // Do not advance this recipient's snapshot after a failed emit.
        }
      }
    } catch (error) {
      failed += batch.length;
      logger.warn('job_item_failed', { job: 'notification_outbox', error });
    }
  }
  if (failed && failOnError) throw new JobFailure({ sent, failed });
  return sent;
}
export function attachRealtime(server, app, config, { poll = true } = {}) {
  const io = new Server(server, {
    cors: { origin: config.CLIENT_ORIGINS, credentials: true },
    allowRequest: (req, done) =>
      done(null, config.CLIENT_ORIGINS.includes(req.headers.origin)),
  });
  io.use(async (socket, next) => {
    try {
      if (!config.CLIENT_ORIGINS.includes(socket.handshake.headers.origin))
        throw new Error('origin');
      const token = parse(socket.handshake.headers.cookie || '')[
        cookieName(config)
      ];
      const claims = verifySession(token, config);
      if (
        !mongoose.isObjectIdOrHexString(claims.sub) ||
        !Number.isInteger(claims.version)
      )
        throw new Error('claims');
      const user = await User.findById(claims.sub).select('+tokenVersion');
      if (!user || user.tokenVersion !== claims.version)
        throw new Error('revoked');
      socket.data = {
        userId: String(user._id),
        version: claims.version,
        expiresAt: claims.exp * 1000,
      };
      next();
    } catch {
      next(new Error('Authentication required'));
    }
  });
  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    socket.emit('notifications:sync');
    const expiry = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, socket.data.expiresAt - Date.now()),
    );
    expiry.unref();
    socket.on('disconnect', () => clearTimeout(expiry));
    // No client-controlled join, room, recipient, or notification-write events exist.
  });
  app.set('io', io);
  let inFlight;
  const logger = app.get('logger') || defaultLogger;
  const flush = () => {
    if (inFlight) return inFlight;
    inFlight = runJob(
      'notification_outbox',
      async () => ({
        sent: await dispatchNotifications(io, { logger, failOnError: true }),
      }),
      { logger },
    ).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
  const timer = poll
    ? setInterval(() => {
        void flush().catch(() => {
          /* Durable inbox and unchanged snapshots retry on the next active tick. */
        });
      }, 2000)
    : null;
  timer?.unref();
  return {
    io,
    flush,
    close: async () => {
      if (timer) clearInterval(timer);
      await inFlight?.catch(() => {});
      app.set('io', null);
      await new Promise((resolve) => io.close(resolve));
    },
  };
}
