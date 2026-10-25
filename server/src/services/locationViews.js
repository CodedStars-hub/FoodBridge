export function approximatePoint(point) {
  return point
    ? {
        type: 'Point',
        coordinates: point.coordinates.map(
          (value) => Math.round(value * 100) / 100,
        ),
      }
    : undefined;
}
export function donationLocationView(value, viewer, exact = false) {
  const donorId = value.donor?._id || value.donor;
  if (String(donorId) === String(viewer?._id) || exact) return value;
  if (value.location) {
    value.areaLocation = approximatePoint(value.location);
    value.locationPrecision = 'approximate';
  }
  delete value.location;
  value.pickupLocation = 'Exact pickup address shared after acceptance';
  return value;
}
