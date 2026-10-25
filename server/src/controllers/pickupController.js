import { DonationRequest } from '../models/DonationRequest.js';
import { Donation } from '../models/Donation.js';
import { validate } from '../utils/validation.js';
import {
  pickupListQuery,
  pickupActionSchema,
} from '../utils/locationValidation.js';
import { approximatePoint } from '../services/locationViews.js';
import {
  arrangePickup,
  claimPickup,
  updatePickup,
} from '../services/pickupWorkflow.js';
import { HttpError } from '../utils/HttpError.js';
const same = (a, b) => String(a?._id || a) === String(b?._id || b);
function wasVolunteer(request, user) {
  return (
    user.role === 'volunteer' &&
    request.pickup?.events.some(
      (event) => event.action === 'claim' && same(event.actor, user),
    )
  );
}
function eligibleAvailable(request) {
  return (
    request.status === 'accepted' &&
    request.pickup?.status === 'awaiting_volunteer' &&
    request.donation?.pickupDeadline > new Date()
  );
}
const populate = [
  { path: 'donation', select: 'title donor pickupDeadline' },
  { path: 'ngo', select: 'name organizationName' },
  { path: 'pickup.volunteer', select: 'name organizationName' },
];
export function assignmentView(request, user) {
  const pickup = request.pickup;
  const donation = request.donation;
  const participant =
    (user.role === 'ngo' && same(request.ngo, user)) ||
    (user.role === 'donor' && same(donation?.donor, user));
  const current = user.role === 'volunteer' && same(pickup.volunteer, user);
  const precise =
    participant ||
    (current &&
      ((pickup.status === 'picked_up' && request.status === 'handed_over') ||
        (['assigned', 'en_route_to_pickup'].includes(pickup.status) &&
          request.status === 'accepted' &&
          donation?.pickupDeadline > new Date())));
  return {
    _id: String(request._id),
    requestStatus: request.status,
    requestedQuantity: request.requestedQuantity,
    unit: request.unit,
    donation: donation
      ? {
          _id: donation._id,
          title: donation.title,
          pickupDeadline: donation.pickupDeadline,
        }
      : null,
    status: pickup.status,
    volunteer:
      pickup.volunteer && (participant || current)
        ? {
            id: String(pickup.volunteer._id || pickup.volunteer),
            name: pickup.volunteer.name || 'Volunteer',
          }
        : null,
    ngo:
      participant || current
        ? { name: request.ngo?.organizationName || request.ngo?.name || 'NGO' }
        : undefined,
    origin: precise
      ? pickup.origin
      : {
          address: 'Approximate pickup area',
          location: approximatePoint(pickup.origin.location),
        },
    destination: precise
      ? pickup.destination
      : {
          address: 'Approximate delivery area',
          location: approximatePoint(pickup.destination.location),
        },
    locationPrecision: precise ? 'exact' : 'approximate',
    assignedToMe: current,
    previouslyAssignedToMe: wasVolunteer(request, user),
    canClaim:
      user.role === 'volunteer' &&
      user.verificationStatus === 'verified' &&
      eligibleAvailable(request),
    issue: participant || current ? pickup.issue : undefined,
    arrivalReportedAt: pickup.arrivalReportedAt,
    events: precise ? pickup.events : undefined,
    updatedAt: request.updatedAt,
  };
}
async function load(id) {
  const result = await DonationRequest.findById(id).populate(populate);
  if (!result?.pickup) throw new HttpError(404, 'Pickup not found');
  return result;
}
export async function detail(req, res) {
  const request = await load(req.params.id);
  const participant =
    (req.user.role === 'ngo' && same(request.ngo, req.user)) ||
    (req.user.role === 'donor' && same(request.donation?.donor, req.user));
  const volunteer =
    req.user.role === 'volunteer' &&
    (same(request.pickup.volunteer, req.user) ||
      wasVolunteer(request, req.user) ||
      (req.user.verificationStatus === 'verified' &&
        eligibleAvailable(request)));
  if (!participant && !volunteer)
    throw new HttpError(403, 'This pickup is private to its participants');
  res.json({ assignment: assignmentView(request, req.user) });
}
export async function list(req, res) {
  const query = validate(pickupListQuery, req.query);
  const available = req.path === '/available';
  let filter = { 'pickup.status': { $exists: true } };
  if (available) {
    if (
      req.user.role !== 'volunteer' ||
      req.user.verificationStatus !== 'verified'
    )
      throw new HttpError(
        403,
        'Only verified volunteers may browse available pickup assignments',
      );
    const ids = await Donation.find({
      pickupDeadline: { $gt: new Date() },
      status: { $in: ['available', 'reserved'] },
    }).distinct('_id');
    filter = {
      donation: { $in: ids },
      status: 'accepted',
      'pickup.status': 'awaiting_volunteer',
    };
  } else if (req.user.role === 'volunteer')
    filter.$or = [
      { 'pickup.volunteer': req.user._id },
      {
        'pickup.events': {
          $elemMatch: { action: 'claim', actor: req.user._id },
        },
      },
    ];
  else if (req.user.role === 'ngo') filter.ngo = req.user._id;
  else
    filter.donation = {
      $in: await Donation.find({ donor: req.user._id }).distinct('_id'),
    };
  if (query.status) {
    if (available && query.status !== 'awaiting_volunteer')
      throw new HttpError(
        400,
        'Available pickups must be awaiting a volunteer',
      );
    filter['pickup.status'] = query.status;
  }
  const [items, total] = await Promise.all([
    DonationRequest.find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate(populate),
    DonationRequest.countDocuments(filter),
  ]);
  res.json({
    items: items.map((item) => assignmentView(item, req.user)),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  });
}
export async function arrange(req, res) {
  validateEmpty(req.body);
  await arrangePickup(req.params.id, req.user);
  res
    .status(201)
    .json({ assignment: assignmentView(await load(req.params.id), req.user) });
}
export async function claim(req, res) {
  validateEmpty(req.body);
  await claimPickup(req.params.id, req.user);
  res.json({ assignment: assignmentView(await load(req.params.id), req.user) });
}
export async function update(req, res) {
  await updatePickup(
    req.params.id,
    req.user,
    validate(pickupActionSchema, req.body),
  );
  res.json({ assignment: assignmentView(await load(req.params.id), req.user) });
}
function validateEmpty(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).length
  )
    throw new HttpError(
      400,
      'Send an empty JSON object; assignment fields are server managed',
    );
}
