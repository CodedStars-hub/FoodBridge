export function locationInput(input, original = {}) {
  const longitude = input.locationLongitude;
  const latitude = input.locationLatitude;
  delete input.locationLongitude;
  delete input.locationLatitude;
  if (!!longitude !== !!latitude)
    throw new Error('Provide both longitude and latitude, or leave both empty');
  if (longitude && latitude) {
    const coordinates = [Number(longitude), Number(latitude)];
    if (
      !coordinates.every(Number.isFinite) ||
      coordinates[0] < -180 ||
      coordinates[0] > 180 ||
      coordinates[1] < -90 ||
      coordinates[1] > 90
    )
      throw new Error(
        'Coordinates must be longitude −180 to 180 and latitude −90 to 90',
      );
    input.location = { type: 'Point', coordinates };
  } else if (original.location) input.location = null;
  if (input.address === '' && !original.address) delete input.address;
  return input;
}
