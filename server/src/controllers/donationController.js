import { z } from 'zod';
import mongoose from 'mongoose';
import {
  cloudinaryEnabled,
  imageLimits,
} from '../services/cloudinaryClient.js';
import { donationLocationView } from '../services/locationViews.js';
import { Donation } from '../models/Donation.js';
import { DonationRequest } from '../models/DonationRequest.js';
import { validate } from '../utils/validation.js';
import {
  createDonationSchema,
  editDonationSchema,
  donationQuerySchema,
  requestQuerySchema,
  createRequestSchema,
  actionSchema,
} from '../utils/donationValidation.js';
import {
  displayStatus,
  editDonation,
  cancelDonation,
  submitRequest,
  transitionRequest,
} from '../services/donationWorkflow.js';
import { HttpError } from '../utils/HttpError.js';
export function validId(req, _res, next, id) {
  if (!mongoose.isObjectIdOrHexString(id))
    throw new HttpError(400, 'Invalid identifier');
  next();
}
function donationView(doc, viewer, exact = false) {
  const value = doc.toObject ? doc.toObject() : { ...doc };
  value.status = displayStatus({
    ...value,
    pickupDeadline: new Date(value.pickupDeadline),
  });
  delete value.workflowVersion;
  delete value.imageVersion;
  delete value.__v;
  return donationLocationView(value, viewer, exact);
}
const donorFields = 'name organizationName';
async function pageResults(Model, filter, query, populate) {
  const [items, total] = await Promise.all([
    Model.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .populate(populate),
    Model.countDocuments(filter),
  ]);
  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  };
}
export async function create(req, res) {
  const input = validate(createDonationSchema, req.body);
  const donation = await Donation.create({
    ...input,
    donor: req.user._id,
    remainingQuantity: input.quantity,
  });
  res.status(201).json({ donation: donationView(donation, req.user) });
}
export async function list(req, res) {
  const query = validate(donationQuerySchema, req.query);
  const filter = {
    status: 'available',
    pickupDeadline: { $gt: new Date() },
    remainingQuantity: { $gt: 0 },
  };
  if (query.status && query.status !== 'available')
    throw new HttpError(400, 'Explore only lists available donations');
  if (query.category) filter.category = query.category;
  if (query.unit) filter.unit = query.unit;
  if (query.q)
    filter.title = {
      $regex: query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      $options: 'i',
    };
  const result = await pageResults(Donation, filter, query, {
    path: 'donor',
    select: donorFields,
  });
  res.json({
    ...result,
    items: result.items.map((item) => donationView(item, req.user)),
  });
}
export async function mine(req, res) {
  const query = validate(donationQuerySchema, req.query);
  const filter = { donor: req.user._id };
  if (query.status === 'expired') {
    filter.pickupDeadline = { $lte: new Date() };
    filter.status = { $nin: ['cancelled', 'completed'] };
  } else if (query.status) {
    filter.status = query.status;
    if (['available', 'reserved'].includes(query.status))
      filter.pickupDeadline = { $gt: new Date() };
  }
  if (query.category) filter.category = query.category;
  if (query.unit) filter.unit = query.unit;
  if (query.q)
    filter.title = {
      $regex: query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      $options: 'i',
    };
  const result = await pageResults(Donation, filter, query, {
    path: 'donor',
    select: donorFields,
  });
  res.json({
    ...result,
    items: result.items.map((item) => donationView(item, req.user)),
  });
}
export async function detail(req, res) {
  const donation = await Donation.findById(req.params.id).populate(
    'donor',
    donorFields,
  );
  if (!donation) throw new HttpError(404, 'Donation not found');
  const exact =
    req.user.role === 'ngo' &&
    !!(await DonationRequest.exists({
      donation: donation._id,
      ngo: req.user._id,
      status: { $in: ['accepted', 'handed_over', 'completed'] },
    }));
  res.json({
    donation: donationView(donation, req.user, exact),
    imageUpload: {
      enabled: cloudinaryEnabled(req.app.get('config')),
      maxBytes: imageLimits.maxBytes,
      supportedFormats: imageLimits.formats,
    },
  });
}
export async function edit(req, res) {
  res.json({
    donation: donationView(
      await editDonation(
        req.params.id,
        req.user,
        validate(editDonationSchema, req.body),
      ),
      req.user,
    ),
  });
}
export async function cancel(req, res) {
  validate(z.strictObject({}), req.body);
  res.json({
    donation: donationView(
      await cancelDonation(req.params.id, req.user),
      req.user,
    ),
  });
}
export async function requestFood(req, res) {
  res.status(201).json({
    request: await submitRequest(
      req.params.id,
      req.user,
      validate(createRequestSchema, req.body),
    ),
  });
}
export async function changeRequest(req, res) {
  const { action } = validate(actionSchema, req.body);
  res.json({
    request: await transitionRequest(req.params.id, req.user, action),
  });
}
export async function requests(req, res) {
  const query = validate(requestQuerySchema, req.query);
  const filter =
    req.user.role === 'donor'
      ? {
          donation: {
            $in: await Donation.find({ donor: req.user._id }).distinct('_id'),
          },
        }
      : { ngo: req.user._id };
  if (query.status) filter.status = query.status;
  if (req.path === '/history') {
    const terminal = ['completed', 'cancelled', 'rejected', 'expired'];
    if (query.status && !terminal.includes(query.status))
      throw new HttpError(400, 'History only includes closed requests');
    filter.status = query.status || { $in: terminal };
  }
  const result = await pageResults(DonationRequest, filter, query, [
    {
      path: 'donation',
      select: '-workflowVersion',
      populate: { path: 'donor', select: donorFields },
    },
    { path: 'ngo', select: donorFields },
  ]);
  res.json({
    ...result,
    items: result.items.map((doc) => {
      const value = doc.toObject();
      if (value.donation)
        value.donation = donationView(
          value.donation,
          req.user,
          ['accepted', 'handed_over', 'completed'].includes(value.status),
        );
      delete value.__v;
      return value;
    }),
  });
}
