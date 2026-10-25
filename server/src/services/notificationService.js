import { Notification } from '../models/Notification.js';
export async function persistNotification(
  { recipient, eventKey, type, message, request, donation },
  session,
) {
  await Notification.updateOne(
    { recipient, eventKey },
    {
      $setOnInsert: {
        type,
        message,
        request,
        donation,
        readAt: null,
        broadcastAt: null,
      },
    },
    { upsert: true, session },
  );
}
// Persist the outbox in the business transaction. Network delivery happens elsewhere after commit.
export async function notifyRequest(
  request,
  donation,
  actor,
  type,
  session,
  message,
) {
  request.notificationVersion = (request.notificationVersion || 0) + 1;
  await request.save({ session });
  const recipients = [donation.donor, request.ngo, request.pickup?.volunteer]
    .filter(Boolean)
    .map((value) => String(value._id || value));
  const actorId = String(actor?._id || actor || '');
  for (const recipient of new Set(recipients)) {
    if (recipient === actorId) continue;
    await persistNotification(
      {
        recipient,
        eventKey: `${request._id}:${request.notificationVersion}:${type}`,
        type,
        message:
          message ||
          `${donation.title}: ${type.replaceAll('_', ' ')}${type === 'pickup_status_changed' ? ` — ${request.pickup?.status.replaceAll('_', ' ')}` : ''}`,
        request: request._id,
        donation: donation._id,
      },
      session,
    );
  }
}
export function notificationView(doc) {
  return {
    id: String(doc._id),
    type: doc.type,
    message: doc.message,
    requestId: doc.request ? String(doc.request) : null,
    donationId: doc.donation ? String(doc.donation) : null,
    readAt: doc.readAt,
    createdAt: doc.createdAt,
  };
}
export function emitInboxChange(io, recipient) {
  try {
    io?.to(`user:${recipient}`).emit('notifications:changed', {});
  } catch {
    /* Durable inbox remains authoritative. */
  }
}
