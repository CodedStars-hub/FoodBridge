import { User } from '../models/User.js';
import { HttpError } from '../utils/HttpError.js';
export const uncollectedPickupStates = [
  'awaiting_volunteer',
  'assigned',
  'en_route_to_pickup',
];
export function pickupEvent(pickup, action, actor, reason = '') {
  pickup.events.push({
    action,
    status: pickup.status,
    actor: actor?._id || actor,
    at: new Date(),
    reason,
  });
  pickup.version += 1;
}
export function cancelPickup(request, actor, reason) {
  if (
    !request.pickup ||
    !uncollectedPickupStates.includes(request.pickup.status)
  )
    return;
  request.pickup.status = 'cancelled';
  pickupEvent(request.pickup, 'cancel', actor, reason);
}
export async function pickupHandover(request, actor, session) {
  if (!request.pickup || request.pickup.status === 'cancelled') return;
  if (!['assigned', 'en_route_to_pickup'].includes(request.pickup.status))
    throw new HttpError(
      409,
      'A volunteer must claim this pickup before handover. Cancel transportation to use direct handover',
    );
  const volunteer = await User.findById(request.pickup.volunteer).session(
    session,
  );
  if (
    volunteer?.role !== 'volunteer' ||
    volunteer.verificationStatus !== 'verified'
  )
    throw new HttpError(
      409,
      'The assigned volunteer is no longer eligible; cancel transportation and reassign before handover',
    );
  request.pickup.status = 'picked_up';
  pickupEvent(request.pickup, 'donor_handover', actor);
}
export function pickupReceipt(request, actor) {
  if (!request.pickup || request.pickup.status === 'cancelled') return;
  if (request.pickup.status !== 'picked_up')
    throw new HttpError(409, 'Donor handover must precede NGO receipt');
  request.pickup.status = 'delivered';
  request.pickup.issue = '';
  pickupEvent(request.pickup, 'ngo_receipt', actor);
}
