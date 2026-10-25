import { Donation } from '../models/Donation.js';
import { DonationRequest } from '../models/DonationRequest.js';
import { User } from '../models/User.js';
const month = (field) => ({
  $dateToString: { format: '%Y-%m', date: field, timezone: 'UTC' },
});
const count = () => [{ $count: 'value' }];
const amount = (values) => values[0]?.value || 0;
const receiptDate = { $ifNull: ['$receivedAt', '$updatedAt'] };
export async function getAnalytics(user, range, now = new Date()) {
  const dates = { $gte: range.from, $lt: range.to };
  const role = user.role;
  const receiptScope = {
    status: 'completed',
    ...(role === 'ngo' ? { ngo: user._id } : {}),
  };
  const receipts = [
    { $match: receiptScope },
    { $set: { receiptDate } },
    { $match: { receiptDate: dates } },
  ];
  if (role === 'donor')
    receipts.push(
      {
        $lookup: {
          from: Donation.collection.name,
          localField: 'donation',
          foreignField: '_id',
          as: 'listing',
          pipeline: [{ $project: { donor: 1 } }],
        },
      },
      { $match: { 'listing.donor': user._id } },
    );
  const output = {
    role,
    range: range.display,
    generatedAt: now.toISOString(),
    summary: {},
    quantitiesByUnit: [],
    monthly: [],
    notes: [
      'Quantities are never combined across units. Food is counted only after NGO receipt. Dates and month buckets are UTC.',
    ],
  };
  if (['donor', 'admin'].includes(role)) {
    const [listings] = await Donation.aggregate([
      {
        $match: {
          createdAt: dates,
          ...(role === 'donor' ? { donor: user._id } : {}),
        },
      },
      {
        $facet: {
          total: count(),
          active: [
            {
              $match: {
                status: { $in: ['available', 'reserved'] },
                pickupDeadline: { $gt: now },
              },
            },
            ...count(),
          ],
          completed: [{ $match: { status: 'completed' } }, ...count()],
          monthly: [
            { $group: { _id: month('$createdAt'), donations: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);
    output.summary = {
      totalDonations: amount(listings.total),
      activeDonations: amount(listings.active),
      completedDonations: amount(listings.completed),
    };
    output.monthly = listings.monthly.map((row) => ({
      month: row._id,
      donations: row.donations,
    }));
    if (role === 'admin') {
      output.summary.completionRate = output.summary.totalDonations
        ? Math.round(
            (output.summary.completedDonations /
              output.summary.totalDonations) *
              10000,
          ) / 100
        : 0;
      const [userStats] = await User.aggregate([
        { $match: { createdAt: dates } },
        {
          $facet: {
            roles: [{ $group: { _id: '$role', count: { $sum: 1 } } }],
            monthly: [
              { $group: { _id: month('$createdAt'), users: { $sum: 1 } } },
            ],
          },
        },
      ]);
      const users = userStats.roles;
      for (const row of userStats.monthly) {
        let period = output.monthly.find((item) => item.month === row._id);
        if (!period) {
          period = { month: row._id };
          output.monthly.push(period);
        }
        period.users = row.users;
      }
      output.usersByRole = ['donor', 'ngo', 'volunteer', 'admin'].map(
        (role) => ({
          role,
          count: users.find((row) => row._id === role)?.count || 0,
        }),
      );
      output.summary.totalUsers = output.usersByRole.reduce(
        (sum, row) => sum + row.count,
        0,
      );
    }
  } else if (role === 'ngo') {
    const [requests] = await DonationRequest.aggregate([
      { $match: { ngo: user._id, createdAt: dates } },
      {
        $facet: {
          total: count(),
          accepted: [
            { $match: { status: { $in: ['accepted', 'handed_over'] } } },
            ...count(),
          ],
          monthly: [
            { $group: { _id: month('$createdAt'), requests: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);
    output.summary = {
      totalRequests: amount(requests.total),
      acceptedRequests: amount(requests.accepted),
    };
    output.monthly = requests.monthly.map((row) => ({
      month: row._id,
      requests: row.requests,
    }));
  }
  if (['donor', 'ngo', 'admin'].includes(role)) {
    const [received] = await DonationRequest.aggregate([
      ...receipts,
      {
        $facet: {
          units: [
            {
              $group: {
                _id: '$unit',
                quantity: { $sum: '$requestedQuantity' },
                receipts: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          monthly: [
            { $group: { _id: month('$receiptDate'), receipts: { $sum: 1 } } },
          ],
          total: count(),
          legacy: [{ $match: { receivedAt: { $exists: false } } }, ...count()],
        },
      },
    ]);
    output.quantitiesByUnit = received.units.map((row) => ({
      unit: row._id,
      quantity: row.quantity,
      receipts: row.receipts,
    }));
    output.summary.completedReceipts = amount(received.total);
    const periods = new Map(output.monthly.map((row) => [row.month, row]));
    for (const row of received.monthly) {
      if (!periods.has(row._id)) periods.set(row._id, { month: row._id });
      periods.get(row._id).receipts = row.receipts;
    }
    output.monthly = [...periods.values()];
    output.legacyReceiptTimestamps = amount(received.legacy);
    if (output.legacyReceiptTimestamps)
      output.notes.push(
        'Some older completed requests use their last recorded update time because an explicit receipt timestamp was not stored.',
      );
  } else if (role === 'volunteer') {
    const availability = [
      { $match: { status: 'accepted', 'pickup.status': 'awaiting_volunteer' } },
      {
        $lookup: {
          from: Donation.collection.name,
          localField: 'donation',
          foreignField: '_id',
          as: 'listing',
          pipeline: [{ $project: { status: 1, pickupDeadline: 1 } }],
        },
      },
      {
        $match: {
          'listing.pickupDeadline': { $gt: now },
          'listing.status': { $in: ['available', 'reserved'] },
        },
      },
      ...count(),
    ];
    const [available, active, completed, history] = await Promise.all([
      user.verificationStatus === 'verified'
        ? DonationRequest.aggregate(availability)
        : [],
      DonationRequest.aggregate([
        {
          $match: {
            'pickup.volunteer': user._id,
            $or: [
              {
                status: 'accepted',
                'pickup.status': { $in: ['assigned', 'en_route_to_pickup'] },
              },
              { status: 'handed_over', 'pickup.status': 'picked_up' },
            ],
          },
        },
        {
          $lookup: {
            from: Donation.collection.name,
            localField: 'donation',
            foreignField: '_id',
            as: 'listing',
            pipeline: [{ $project: { pickupDeadline: 1 } }],
          },
        },
        {
          $match: {
            $or: [
              { status: 'handed_over' },
              { 'listing.pickupDeadline': { $gt: now } },
            ],
          },
        },
        ...count(),
      ]),
      DonationRequest.aggregate([
        {
          $match: {
            'pickup.volunteer': user._id,
            'pickup.status': 'delivered',
            status: 'completed',
          },
        },
        { $set: { receiptDate } },
        { $match: { receiptDate: dates } },
        {
          $facet: {
            total: count(),
            monthly: [
              { $group: { _id: month('$receiptDate'), pickups: { $sum: 1 } } },
            ],
          },
        },
      ]),
      DonationRequest.aggregate([
        {
          $match: {
            $or: [
              { 'pickup.volunteer': user._id },
              {
                'pickup.events': {
                  $elemMatch: { actor: user._id, action: 'claim' },
                },
              },
            ],
          },
        },
        { $match: { updatedAt: dates } },
        { $sort: { updatedAt: -1, _id: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: Donation.collection.name,
            localField: 'donation',
            foreignField: '_id',
            as: 'listing',
            pipeline: [{ $project: { title: 1 } }],
          },
        },
        {
          $project: {
            title: { $arrayElemAt: ['$listing.title', 0] },
            status: '$pickup.status',
            requestStatus: '$status',
            quantity: '$requestedQuantity',
            unit: 1,
            updatedAt: 1,
            assignedToMe: { $eq: ['$pickup.volunteer', user._id] },
          },
        },
      ]),
    ]);
    output.summary = {
      availableAssignments: amount(available),
      activeAssignments: amount(active),
      completedPickups: amount(completed[0]?.total || []),
    };
    output.monthly = (completed[0]?.monthly || []).map((row) => ({
      month: row._id,
      pickups: row.pickups,
    }));
    output.pickupHistory = history;
    output.notes.push(
      'Available and active assignment counts are live snapshots independent of the date filter. Completion totals use NGO receipt time; recent history uses update time.',
    );
  }
  const existing = new Map(output.monthly.map((row) => [row.month, row]));
  const monthly = [];
  for (
    let cursor = new Date(
      Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1),
    );
    cursor < range.to;
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
    )
  ) {
    const key = cursor.toISOString().slice(0, 7);
    monthly.push({
      month: key,
      donations: 0,
      requests: 0,
      receipts: 0,
      pickups: 0,
      users: 0,
      ...existing.get(key),
    });
  }
  output.monthly = monthly;
  output.notes.push(
    'Listing/request/user counts describe records created in the chosen range and their current state; receipt totals independently use receipt time. Completion rate is completed listings divided by all listings created in range.',
  );
  return output;
}
