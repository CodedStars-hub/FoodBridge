import { Server } from 'socket.io';
import { parse } from 'cookie';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { cookieName, verifySession } from './sessionService.js';
import { logger as defaultLogger } from '../utils/logger.js';
import { runJob, JobFailure } from '../utils/jobRunner.js';
export async function dispatchNotifications(
  io,
  { logger = defaultLogger, failOnError = false } = {},
) {
  if (mongoose.connection.readyState !== 1) {
    if (failOnError) throw new Error('Database unavailable');
    return 0;
  }
  const pending = await Notification.find({ broadcastAt: null })
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();
  const users = new Map();
  for (const row of pending) {
    const key = String(row.recipient);
    if (!users.has(key)) users.set(key, []);
    users.get(key).push(row._id);
  }
  let sent = 0;
  let failed = 0;
  for (const [id, ids] of users) {
    try {
      const current = await User.findById(id).select('+tokenVersion');
      const sockets = await io.in(`user:${id}`).fetchSockets();
      for (const socket of sockets)
        if (
          !current ||
          socket.data.version !== current.tokenVersion ||
          socket.data.expiresAt <= Date.now()
        )
          socket.disconnect(true);
      io.to(`user:${id}`).emit('notifications:changed', {});
      await Notification.updateMany(
        { _id: { $in: ids }, broadcastAt: null },
        { $set: { broadcastAt: new Date() } },
      );
      sent += ids.length;
    } catch (error) {
      failed++;
      logger.warn('job_item_failed', { job: 'notification_outbox', error });
      /* Retry pending outbox rows; delivery failures never touch business state. */
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
  const tick = () => {
    if (inFlight) return;
    inFlight = runJob(
      'notification_outbox',
      async () => ({
        sent: await dispatchNotifications(io, { logger, failOnError: true }),
      }),
      { logger },
    )
      .catch(() => {
        /* Failure already logged; database recovery will retry. */
      })
      .finally(() => {
        inFlight = null;
      });
  };
  const timer = poll ? setInterval(tick, 2000) : null;
  timer?.unref();
  return {
    io,
    close: async () => {
      if (timer) clearInterval(timer);
      await inFlight;
      app.set('io', null);
      await new Promise((resolve) => io.close(resolve));
    },
  };
}
