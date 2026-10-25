import { notifyRequest } from './notificationService.js';
import { Donation } from '../models/Donation.js';
import { DonationRequest } from '../models/DonationRequest.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/HttpError.js';
import { transaction, displayStatus } from './donationWorkflow.js';
import {
  pickupEvent,
  cancelPickup,
  uncollectedPickupStates,
} from './pickupLifecycle.js';
const fail = (status, message) => {
  throw new HttpError(status, message);
};
async function context(id, session) {
  const request = await DonationRequest.findById(id).session(session);
  if (!request) fail(404, 'Request not found');
  const donation = await Donation.findById(request.donation)
    .select('+workflowVersion')
    .session(session);
  if (!donation) fail(404, 'Donation not found');
  return { request, donation };
}
function isNgo(request, user) {
  return user.role === 'ngo' && String(request.ngo) === String(user._id);
}
function isDonor(donation, user) {
  return user.role === 'donor' && String(donation.donor) === String(user._id);
}
async function lockDonation(donation, session) {
  donation.status = displayStatus(donation);
  donation.workflowVersion += 1;
  await donation.save({ session });
}
function beforeHandover(request, donation) {
  if (
    request.status !== 'accepted' ||
    donation.pickupDeadline <= new Date() ||
    !['available', 'reserved'].includes(donation.status)
  )
    fail(409, 'Pickup requires an accepted request before the pickup deadline');
}
export async function arrangePickup(id, user) {
  return transaction(async (session) => {
    const { request, donation } = await context(id, session);
    if (!isNgo(request, user))
      fail(
        403,
        'Only the requesting NGO may arrange delivery and share its destination',
      );
    beforeHandover(request, donation);
    if (request.pickup && request.pickup.status !== 'cancelled')
      fail(409, 'Pickup is already arranged');
    const ngo = await User.findById(user._id)
      .select('+location +address')
      .session(session);
    if (!donation.location || !ngo?.location || !ngo.address)
      fail(
        400,
        'Donation coordinates and the NGO delivery address and coordinates are required; direct handover remains available',
      );
    const previous = request.pickup;
    request.pickup = {
      status: 'awaiting_volunteer',
      volunteer: null,
      origin: { address: donation.pickupLocation, location: donation.location },
      destination: { address: ngo.address, location: ngo.location },
      version: previous?.version || 0,
      events: previous?.events || [],
    };
    pickupEvent(request.pickup, 'arrange', user);
    await lockDonation(donation, session);
    await request.save({ session });
    await notifyRequest(
      request,
      donation,
      user,
      'pickup_status_changed',
      session,
    );
    return request;
  });
}
export async function claimPickup(id, user) {
  return transaction(async (session) => {
    const volunteer = await User.findById(user._id).session(session);
    if (
      volunteer?.role !== 'volunteer' ||
      volunteer.verificationStatus !== 'verified'
    )
      fail(403, 'Only verified volunteers may claim pickups');
    const { request, donation } = await context(id, session);
    beforeHandover(request, donation);
    if (!request.pickup || request.pickup.status !== 'awaiting_volunteer')
      fail(409, 'This pickup is no longer available');
    await lockDonation(donation, session);
    const assigned = await DonationRequest.findOneAndUpdate(
      {
        _id: id,
        status: 'accepted',
        'pickup.status': 'awaiting_volunteer',
        'pickup.volunteer': null,
      },
      {
        $set: {
          'pickup.status': 'assigned',
          'pickup.volunteer': user._id,
          'pickup.issue': '',
        },
        $inc: { 'pickup.version': 1 },
        $push: {
          'pickup.events': {
            action: 'claim',
            status: 'assigned',
            actor: user._id,
            at: new Date(),
          },
        },
      },
      { session, new: true, runValidators: true },
    );
    if (!assigned)
      fail(409, 'Another volunteer has already claimed this pickup');
    await notifyRequest(assigned, donation, user, 'volunteer_claimed', session);
    return assigned;
  });
}
export async function updatePickup(id, user, { action, reason = '' }) {
  return transaction(async (session) => {
    const { request, donation } = await context(id, session);
    const pickup = request.pickup;
    if (!pickup) fail(404, 'Pickup not arranged');
    const currentVolunteer =
      user.role === 'volunteer' &&
      String(pickup.volunteer) === String(user._id);
    if (action === 'cancel') {
      if (!isNgo(request, user) && !isDonor(donation, user))
        fail(
          403,
          'Only the participating donor or NGO may cancel transportation',
        );
      if (
        request.status !== 'accepted' ||
        !uncollectedPickupStates.includes(pickup.status)
      )
        fail(409, 'Transportation cannot be cancelled after physical handover');
      cancelPickup(
        request,
        user,
        reason || 'Transportation cancelled; reservation remains active',
      );
    } else {
      if (!currentVolunteer)
        fail(
          403,
          'Only the currently assigned volunteer may update this pickup',
        );
      if (action === 'start') {
        beforeHandover(request, donation);
        const eligible = await User.findById(user._id).session(session);
        if (eligible?.verificationStatus !== 'verified')
          fail(403, 'Volunteer verification is required to start a pickup');
        if (pickup.status !== 'assigned')
          fail(409, 'Only an assigned pickup can start');
        pickup.status = 'en_route_to_pickup';
      }
      if (
        action === 'release' ||
        (action === 'report_failure' &&
          uncollectedPickupStates.includes(pickup.status))
      ) {
        if (
          request.status !== 'accepted' ||
          !['assigned', 'en_route_to_pickup'].includes(pickup.status)
        )
          fail(
            409,
            'Food already handed over cannot be released or reassigned',
          );
        pickup.status =
          donation.pickupDeadline > new Date()
            ? 'awaiting_volunteer'
            : 'cancelled';
        pickup.volunteer = null;
      } else if (action === 'report_failure') {
        if (pickup.status !== 'picked_up' || request.status !== 'handed_over')
          fail(409, 'No active pickup to report');
        pickup.issue = reason;
      }
      if (action === 'arrive') {
        if (pickup.status !== 'picked_up' || request.status !== 'handed_over')
          fail(
            409,
            'Donor-confirmed handover is required before reporting arrival',
          );
        if (pickup.arrivalReportedAt)
          fail(
            409,
            'Arrival has already been reported; only the NGO can confirm receipt',
          );
        pickup.arrivalReportedAt = new Date();
      }
      pickupEvent(pickup, action, user, reason);
    }
    await lockDonation(donation, session);
    await request.save({ session });
    await notifyRequest(
      request,
      donation,
      user,
      'pickup_status_changed',
      session,
    );
    return request;
  });
}
