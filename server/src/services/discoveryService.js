import { Donation } from '../models/Donation.js';
import { HttpError } from '../utils/HttpError.js';
import { donationLocationView } from './locationViews.js';
export function matchingComponents({
  distanceKm,
  radiusKm,
  quantity,
  available,
  minutesRemaining,
  windowMinutes,
}) {
  return {
    distance: Math.max(0, Math.min(100, 100 * (1 - distanceKm / radiusKm))),
    quantity: Math.min(100, (100 * quantity) / available),
    pickupTime: Math.max(
      0,
      Math.min(100, (100 * minutesRemaining) / windowMinutes),
    ),
  };
}
export function weightedScore(components, weights) {
  return (
    Math.round(
      (components.distance * weights.distance +
        components.quantity * weights.quantity +
        components.pickupTime * weights.pickupTime) *
        100,
    ) / 100
  );
}
export async function discover(
  user,
  query,
  config,
  ranked = false,
  now = new Date(),
) {
  const coordinates =
    query.longitude !== undefined
      ? [query.longitude, query.latitude]
      : user.location?.coordinates;
  if (!coordinates)
    throw new HttpError(
      400,
      'Set your profile location or provide longitude and latitude. Normal donation browsing remains available without coordinates',
    );
  if (ranked && (!query.quantity || !query.unit))
    throw new HttpError(
      400,
      'Recommendations require quantity and unit; partial matches are not treated as complete fulfillment',
    );
  if (query.quantity && !query.unit)
    throw new HttpError(400, 'Specify a unit when filtering by quantity');
  const radiusKm = query.radiusKm ?? config.GEO_DEFAULT_RADIUS_KM;
  if (radiusKm > config.GEO_MAX_RADIUS_KM)
    throw new HttpError(400, 'Radius exceeds the configured maximum');
  const quantity = query.quantity || 1;
  const weights = {
    distance: config.MATCH_DISTANCE_WEIGHT / 100,
    quantity: config.MATCH_QUANTITY_WEIGHT / 100,
    pickupTime: config.MATCH_TIME_WEIGHT / 100,
  };
  const filter = {
    status: 'available',
    remainingQuantity: { $gt: 0 },
    pickupDeadline: { $gt: now },
    ...(query.unit ? { unit: query.unit } : {}),
    ...(query.category ? { category: query.category } : {}),
  };
  const pipeline = [
    {
      $geoNear: {
        near: { type: 'Point', coordinates },
        key: 'location',
        distanceField: 'geoDistance',
        maxDistance: radiusKm * 1000,
        spherical: true,
        query: filter,
      },
    },
    {
      $facet: {
        items: [
          { $match: { remainingQuantity: { $gte: quantity } } },
          {
            $set: {
              distanceKm: { $round: [{ $divide: ['$geoDistance', 1000] }, 1] },
              minutesRemaining: {
                $divide: [{ $subtract: ['$pickupDeadline', now] }, 60000],
              },
            },
          },
          {
            $set: {
              components: {
                distance: {
                  $max: [
                    0,
                    {
                      $multiply: [
                        100,
                        {
                          $subtract: [
                            1,
                            { $divide: ['$distanceKm', radiusKm] },
                          ],
                        },
                      ],
                    },
                  ],
                },
                quantity: {
                  $min: [
                    100,
                    {
                      $multiply: [
                        100,
                        { $divide: [quantity, '$remainingQuantity'] },
                      ],
                    },
                  ],
                },
                pickupTime: {
                  $min: [
                    100,
                    {
                      $multiply: [
                        100,
                        {
                          $divide: [
                            '$minutesRemaining',
                            config.MATCH_PICKUP_WINDOW_MINUTES,
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
          {
            $set: {
              score: {
                $round: [
                  {
                    $add: [
                      { $multiply: ['$components.distance', weights.distance] },
                      { $multiply: ['$components.quantity', weights.quantity] },
                      {
                        $multiply: [
                          '$components.pickupTime',
                          weights.pickupTime,
                        ],
                      },
                    ],
                  },
                  2,
                ],
              },
            },
          },
          {
            $sort: ranked
              ? { score: -1, distanceKm: 1, pickupDeadline: 1, _id: 1 }
              : { geoDistance: 1, _id: 1 },
          },
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
          { $project: { workflowVersion: 0, __v: 0, geoDistance: 0 } },
        ],
        total: [
          { $match: { remainingQuantity: { $gte: quantity } } },
          { $count: 'count' },
        ],
        insufficient: [
          { $match: { remainingQuantity: { $lt: quantity } } },
          { $count: 'count' },
        ],
      },
    },
  ];
  const [result] = await Donation.aggregate(pipeline);
  const total = result.total[0]?.count || 0;
  const items = result.items.map((doc) => {
    const view = donationLocationView(doc, user);
    if (ranked)
      view.match = {
        score: doc.score,
        components: doc.components,
        weights,
        requestedQuantity: quantity,
        availableQuantity: doc.remainingQuantity,
        unit: doc.unit,
        fulfillment: 'complete',
        distanceKm: doc.distanceKm,
        minutesRemaining: Math.floor(doc.minutesRemaining),
        windowMinutes: config.MATCH_PICKUP_WINDOW_MINUTES,
      };
    delete view.components;
    delete view.score;
    delete view.minutesRemaining;
    return view;
  });
  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
    eligibility: {
      radiusKm,
      requestedQuantity: quantity,
      unit: query.unit || null,
      partialFulfillment: false,
      excludedInsufficientQuantity: result.insufficient[0]?.count || 0,
    },
    asOf: now.toISOString(),
    assumptions:
      'Approximate straight-line distance; not road travel time or a food safety certification',
  };
}
