import { useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { useApiData } from '../hooks/useApiData.js';
import {
  DonationCard,
  DataState,
  Pagination,
} from '../components/DonationShared.jsx';
import LocationMap from '../components/LocationMap.jsx';
import { unitOptions, categoryOptions, readable } from '../utils/donation.js';
function Results({ query, ranked }) {
  const [page, setPage] = useState(1);
  const result = useApiData(
    `/donations/${ranked ? 'recommendations' : 'nearby'}?${new URLSearchParams({ ...query, page })}`,
  );
  return (
    <>
      <DataState {...result} retry={result.refresh} empty={false}>
        {result.data && (
          <>
            {result.data.eligibility.excludedInsufficientQuantity > 0 && (
              <p className="notice-panel">
                {result.data.eligibility.excludedInsufficientQuantity} nearby
                listing(s) could not fully meet your requested quantity. Partial
                inventory is excluded, never shown as complete fulfillment.
              </p>
            )}
            {!result.data.items.length ? (
              <div className="workspace-state empty-state">
                <h2>No eligible donations nearby.</h2>
                <p>
                  Try a wider radius, different unit or a smaller quantity.
                  Listings without coordinates remain in Explore Donations.
                </p>
              </div>
            ) : (
              <>
                <LocationMap
                  approximate
                  points={result.data.items.map((d) => ({
                    label: d.title,
                    location: d.areaLocation || d.location,
                  }))}
                />
                <div className="donations-grid">
                  {result.data.items.map((d) => (
                    <div className="recommendation" key={d._id}>
                      <DonationCard donation={d} />
                      {d.match && (
                        <section
                          className="match-explanation"
                          aria-label={`Match explanation for ${d.title}`}
                        >
                          <div>
                            <strong>{d.match.score.toFixed(1)} / 100</strong>
                            <span>
                              Explainable match · full requested quantity
                            </span>
                          </div>
                          {[
                            ['distance', 'Distance suitability'],
                            ['quantity', 'Quantity suitability'],
                            ['pickupTime', 'Pickup window suitability'],
                          ].map(([key, label]) => (
                            <p key={key}>
                              <span>
                                {label} ·{' '}
                                {(d.match.weights[key] * 100).toFixed(0)}%
                                weight
                              </span>
                              <strong>
                                {d.match.components[key].toFixed(1)}/100
                              </strong>
                            </p>
                          ))}
                          <small>
                            {d.match.distanceKm.toFixed(1)} km approximate
                            straight-line distance · {d.match.availableQuantity}{' '}
                            {d.match.unit} available for{' '}
                            {d.match.requestedQuantity} requested ·{' '}
                            {d.match.minutesRemaining} minutes until pickup
                            cutoff. Quantity favours a closer fit; pickup time
                            favours more time remaining, up to{' '}
                            {d.match.windowMinutes} minutes.
                          </small>
                        </section>
                      )}
                      {!ranked && (
                        <p className="field-hint distance-note">
                          {d.distanceKm.toFixed(1)} km approximate straight-line
                          distance
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                <Pagination
                  pagination={result.data.pagination}
                  onPage={setPage}
                />
              </>
            )}
          </>
        )}
      </DataState>
    </>
  );
}
export default function DiscoveryPage({ ranked = false }) {
  const { user } = useAuth();
  const [search, setSearch] = useState(null);
  const [searchVersion, setSearchVersion] = useState(0);
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!!values.longitude !== !!values.latitude) {
      setError('Provide both longitude and latitude');
      return;
    }
    if (!values.longitude && !user.location) {
      setError('Add your profile location or enter both coordinates here.');
      return;
    }
    if (values.quantity && !values.unit) {
      setError('Choose a unit for the requested quantity');
      return;
    }
    setSearchVersion((value) => value + 1);
    setSearch(
      Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== ''),
      ),
    );
  }
  return (
    <section className="workspace-page">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">LOCAL FOOD. CLEAR REASONS.</span>
          <h1>{ranked ? 'Recommended donations' : 'Nearby donations'}</h1>
          <p>
            {ranked
              ? 'Ranked by distance, full-quantity fit and time remaining. Recommendations do not reserve inventory or certify food safety.'
              : 'Discover available food within a straight-line radius. Exact pickup details are shared after acceptance.'}
          </p>
        </div>
      </div>
      <form
        className="discovery-form profile-card"
        onSubmit={submit}
        aria-label="Donation discovery"
      >
        <div className="profile-fields">
          <label>
            Longitude
            <input
              name="longitude"
              type="number"
              step="any"
              min={-180}
              max={180}
              placeholder={
                user.location ? 'Use saved profile location' : 'Longitude'
              }
            />
          </label>
          <label>
            Latitude
            <input
              name="latitude"
              type="number"
              step="any"
              min={-90}
              max={90}
              placeholder={
                user.location ? 'Use saved profile location' : 'Latitude'
              }
            />
          </label>
          <label>
            Radius (km)
            <input
              name="radiusKm"
              type="number"
              step="any"
              min={0.1}
              max={200}
              placeholder="Use server default"
            />
          </label>
          <label>
            Requested quantity
            <input
              name="quantity"
              type="number"
              step={1}
              min={1}
              max={1000000}
              required={ranked}
              defaultValue={ranked ? 1 : ''}
            />
          </label>
          <label>
            Quantity unit
            <select name="unit" required={ranked}>
              <option value="">{ranked ? 'Choose a unit' : 'Any unit'}</option>
              {unitOptions.map((unit) => (
                <option key={unit}>{unit}</option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select name="category">
              <option value="">All categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>
                  {readable(c)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="field-hint">
          Leave both coordinates empty to use your private saved profile
          location. Radius limits and scoring weights are enforced by the
          server. Distances are not road travel times.
        </p>
        {error && (
          <p className="form-alert" role="alert">
            {error}
          </p>
        )}
        <button className="button">
          {ranked ? 'Find recommendations' : 'Find nearby food'}
        </button>
      </form>
      {search && (
        <Results
          key={`${JSON.stringify(search)}:${searchVersion}`}
          query={search}
          ranked={ranked}
        />
      )}
    </section>
  );
}
