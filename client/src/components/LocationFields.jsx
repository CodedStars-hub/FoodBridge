import FormField from './FormField.jsx';
export default function LocationFields({
  location,
  address,
  includeAddress = false,
  disabled = false,
  error,
}) {
  return (
    <fieldset className="location-fields" disabled={disabled}>
      <legend>Optional location</legend>
      <p className="field-hint">
        Coordinates use longitude first, then latitude. Leave both empty to
        continue without location-based discovery.{' '}
        {includeAddress
          ? 'Your profile location is private. Arranging volunteer transport shares a snapshot of the delivery destination with the participating donor and the assigned volunteer.'
          : 'Donation discovery uses rounded area markers. Precise collection coordinates are shared with the owner, accepted NGOs and their assigned volunteers.'}
      </p>
      {includeAddress && (
        <FormField
          label="Address"
          name="address"
          defaultValue={address || ''}
          maxLength={500}
          autoComplete="street-address"
        />
      )}
      <div className="profile-fields">
        <FormField
          label="Longitude"
          name="locationLongitude"
          type="number"
          step="any"
          min={-180}
          max={180}
          defaultValue={location?.coordinates?.[0] ?? ''}
        />
        <FormField
          label="Latitude"
          name="locationLatitude"
          type="number"
          step="any"
          min={-90}
          max={90}
          defaultValue={location?.coordinates?.[1] ?? ''}
        />
      </div>
      {error && <p className="field-error">{error}</p>}
    </fieldset>
  );
}
