import mongoose from 'mongoose';
import {
  cancelPickup,
  pickupHandover,
  pickupReceipt,
  uncollectedPickupStates,
} from './pickupLifecycle.js';
import { Donation } from '../models/Donation.js';
import { DonationRequest } from '../models/DonationRequest.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/HttpError.js';
const fail = (status, message) => {
  throw new HttpError(status, message);
};
export function displayStatus(donation, now = new Date()) {
  if (['cancelled', 'completed'].includes(donation.status))
    return donation.status;
  if (donation.pickupDeadline <= now) return 'expired';
  return donation.remainingQuantity > 0 ? 'available' : 'reserved';
}
export async function transaction(work) {
  try {
    return await mongoose.connection.transaction(work, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
    });
  } catch (error) {
    if (error.code === 11000)
      fail(409, 'You already have an active request for this donation');
    if (error.code === 20)
      fail(
        503,
        'Donation workflows require MongoDB configured as a replica set',
      );
    throw error;
  }
}
async function saveDonation(donation, session) {
  donation.status = displayStatus(donation);
  donation.workflowVersion += 1;
  await donation.save({ session });
}
async function getDonation(id, session) {
  const donation = await Donation.findById(id)
    .select('+workflowVersion')
    .session(session);
  if (!donation) fail(404, 'Donation not found');
  return donation;
}
function owner(donation, user) {
  if (String(donation.donor) !== String(user._id))
    fail(403, 'Only the donor who owns this donation can change it');
}
function open(donation) {
  if (donation.pickupDeadline <= new Date())
    fail(409, 'The pickup deadline has passed');
  if (!['available', 'reserved'].includes(donation.status))
    fail(409, 'This donation is no longer open');
}
export async function editDonation(id, user, input) {
  return transaction(async (session) => {
    const donation = await getDonation(id, session);
    owner(donation, user);
    open(donation);
    if (
      donation.completedQuantity > 0 ||
      (await DonationRequest.exists({ donation: id, active: true }).session(
        session,
      ))
    )
      fail(
        409,
        'Edits are locked while requests are active or after any receipt. Resolve active requests before editing',
      );
    Object.assign(donation, input);
    if (
      donation.preparationTime > new Date() ||
      donation.pickupDeadline <= new Date() ||
      donation.pickupDeadline <= donation.preparationTime
    )
      fail(400, 'Preparation and pickup times are invalid');
    donation.remainingQuantity = donation.quantity;
    await saveDonation(donation, session);
    return donation;
  });
}
export async function cancelDonation(id, user) {
  return transaction(async (session) => {
    const donation = await getDonation(id, session);
    owner(donation, user);
    if (['cancelled', 'completed'].includes(donation.status))
      fail(409, 'Donation is already closed');
    if (donation.reservedQuantity > 0)
      fail(
        409,
        'Resolve accepted or handed-over reservations before cancelling the donation',
      );
    donation.status = 'cancelled';
    donation.workflowVersion += 1;
    await donation.save({ session });
    await DonationRequest.updateMany(
      { donation: id, status: 'pending' },
      {
        $set: {
          status: 'cancelled',
          active: false,
          resolutionReason: 'Donation cancelled by donor',
        },
      },
      { session },
    );
    return donation;
  });
}
export async function submitRequest(id, user, input) {
  return transaction(async (session) => {
    const ngo = await User.findById(user._id).session(session);
    if (ngo?.role !== 'ngo' || ngo.verificationStatus !== 'verified')
      fail(403, 'Only verified NGOs may request food');
    const donation = await getDonation(id, session);
    open(donation);
    if (input.requestedQuantity > donation.remainingQuantity)
      fail(409, 'Requested quantity exceeds available inventory');
    if (
      await DonationRequest.exists({
        donation: id,
        ngo: user._id,
        active: true,
      }).session(session)
    )
      fail(409, 'You already have an active request for this donation');
    // This write serializes submissions with edits, cancellation and all inventory changes.
    await saveDonation(donation, session);
    const [request] = await DonationRequest.create(
      [{ donation: id, ngo: user._id, ...input, unit: donation.unit }],
      { session },
    );
    return request;
  });
}
export async function transitionRequest(id, user, action) {
  return transaction(async (session) => {
    const request = await DonationRequest.findById(id).session(session);
    if (!request) fail(404, 'Request not found');
    const donation = await getDonation(request.donation, session);
    if (['accept', 'reject', 'handover'].includes(action)) {
      if (user.role !== 'donor')
        fail(403, 'Only the donor can perform this action');
      owner(donation, user);
    } else if (user.role !== 'ngo' || String(request.ngo) !== String(user._id))
      fail(403, 'Only the requesting NGO can perform this action');
    const allowed = {
      accept: ['pending'],
      reject: ['pending'],
      cancel: ['pending', 'accepted'],
      handover: ['accepted'],
      receive: ['handed_over'],
    };
    if (!allowed[action].includes(request.status))
      fail(409, 'This action is not allowed in the current request state');
    if (action === 'accept') {
      open(donation);
      const ngo = await User.findById(request.ngo).session(session);
      if (ngo?.role !== 'ngo' || ngo.verificationStatus !== 'verified')
        fail(403, 'The requesting NGO must still be verified');
      const updated = await Donation.findOneAndUpdate(
        {
          _id: donation._id,
          remainingQuantity: { $gte: request.requestedQuantity },
          pickupDeadline: { $gt: new Date() },
          status: 'available',
        },
        {
          $inc: {
            remainingQuantity: -request.requestedQuantity,
            reservedQuantity: request.requestedQuantity,
            workflowVersion: 1,
          },
          $set: {
            status:
              donation.remainingQuantity === request.requestedQuantity
                ? 'reserved'
                : 'available',
          },
        },
        { session, new: true },
      );
      if (!updated)
        fail(
          409,
          'Not enough inventory remains, or the pickup deadline has passed',
        );
      request.status = 'accepted';
    } else {
      if (action === 'handover') {
        open(donation);
        await pickupHandover(request, user, session);
        request.status = 'handed_over';
      }
      if (action === 'reject') request.status = 'rejected';
      if (action === 'cancel') {
        cancelPickup(request, user, 'NGO cancelled the reservation');
        if (request.status === 'accepted') {
          donation.remainingQuantity += request.requestedQuantity;
          donation.reservedQuantity -= request.requestedQuantity;
        }
        request.status = 'cancelled';
      }
      if (action === 'receive') {
        pickupReceipt(request, user);
        donation.reservedQuantity -= request.requestedQuantity;
        donation.completedQuantity += request.requestedQuantity;
        request.status = 'completed';
        if (donation.completedQuantity === donation.quantity) {
          donation.status = 'completed';
          await DonationRequest.updateMany(
            { donation: donation._id, status: 'pending' },
            {
              $set: {
                status: 'rejected',
                active: false,
                resolutionReason: 'All food in this listing has been received',
              },
            },
            { session },
          );
        }
      }
      await saveDonation(donation, session);
    }
    request.active = ['pending', 'accepted', 'handed_over'].includes(
      request.status,
    );
    await request.save({ session });
    return request;
  });
}
export async function expireDonations(now = new Date()) {
  const candidates = Donation.find({
    pickupDeadline: { $lte: now },
    status: { $in: ['available', 'reserved', 'expired'] },
  })
    .select('_id')
    .cursor();
  let count = 0;
  for await (const candidate of candidates) {
    const changed = await transaction(async (session) => {
      const donation = await getDonation(candidate._id, session);
      if (
        !['available', 'reserved', 'expired'].includes(donation.status) ||
        donation.pickupDeadline > now
      )
        return false;
      const unresolved = await DonationRequest.exists({
        donation: donation._id,
        status: { $in: ['pending', 'accepted'] },
      }).session(session);
      if (donation.status === 'expired' && !unresolved) return false;
      const accepted = await DonationRequest.find({
        donation: donation._id,
        status: 'accepted',
      }).session(session);
      const released = accepted.reduce(
        (sum, request) => sum + request.requestedQuantity,
        0,
      );
      donation.remainingQuantity += released;
      donation.reservedQuantity -= released;
      donation.status = 'expired';
      donation.workflowVersion += 1;
      await donation.save({ session });
      await DonationRequest.updateMany(
        {
          donation: donation._id,
          status: 'accepted',
          'pickup.status': { $in: uncollectedPickupStates },
        },
        {
          $set: { 'pickup.status': 'cancelled' },
          $inc: { 'pickup.version': 1 },
          $push: {
            'pickup.events': {
              action: 'expire',
              status: 'cancelled',
              at: new Date(),
              reason: 'Pickup deadline passed',
            },
          },
        },
        { session },
      );
      await DonationRequest.updateMany(
        { donation: donation._id, status: { $in: ['pending', 'accepted'] } },
        {
          $set: {
            status: 'expired',
            active: false,
            resolutionReason: 'Pickup deadline passed',
          },
        },
        { session },
      );
      return true;
    });
    if (changed) count++;
  }
  return count;
}
