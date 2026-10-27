import { DonationPhoto } from '../components/DonorDonationCard.jsx';
import DonationImageManager from '../components/DonationImageManager.jsx';
import LocationMap from '../components/LocationMap.jsx';
import { useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { useApiData } from '../hooks/useApiData.js';
import { api } from '../utils/api.js';
import {
  DataState,
  StatusBadge,
  ConfirmAction,
} from '../components/DonationShared.jsx';
import { formatTime, readable } from '../utils/donation.js';
import FormField from '../components/FormField.jsx';
function RequestForm({ donation, refresh }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [fields, setFields] = useState({});
  if (user.verificationStatus !== 'verified')
    return (
      <div className="notice-panel">
        <h2>Browse now. Request once verified.</h2>
        <p>
          Your NGO account is {user.verificationStatus}. Only verified NGOs can
          request food. Contact the platform administrator about account
          verification.
        </p>
      </div>
    );
  if (donation.status !== 'available')
    return (
      <p className="notice-panel">
        This donation is not currently available for new requests.
      </p>
    );
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setFields({});
    const input = Object.fromEntries(new FormData(event.currentTarget));
    input.requestedQuantity = Number(input.requestedQuantity);
    try {
      await api(`/donations/${donation._id}/requests`, {
        method: 'POST',
        body: input,
      });
      setSaved(true);
    } catch (failure) {
      setError(failure.message);
      setFields(failure.fields || {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="profile-card request-form">
      <h2>Request food</h2>
      <p>
        Submitting a request does not reserve inventory. The donor must accept
        it first.
      </p>
      {saved ? (
        <div role="status">
          <p className="save-success">Request sent to the donor.</p>
          <Link className="text-link" to="/dashboard/ngo/requests">
            View my requests
          </Link>
        </div>
      ) : (
        <form aria-label="Request food" onSubmit={submit} aria-busy={busy}>
          <FormField
            name="requestedQuantity"
            label={`Requested quantity (${donation.unit})`}
            type="number"
            required
            min={1}
            max={donation.remainingQuantity}
            step={1}
            error={fields.requestedQuantity}
            disabled={busy}
          />
          <FormField
            name="message"
            label="Message to the donor (optional)"
            maxLength={1000}
            error={fields.message}
            disabled={busy}
          />
          {error && (
            <div className="form-alert" role="alert">
              {error}
              <button type="button" className="text-link" onClick={refresh}>
                Refresh availability
              </button>
            </div>
          )}
          <button className="button" disabled={busy}>
            {busy ? 'Sending…' : 'Send request'}
          </button>
        </form>
      )}
    </section>
  );
}
export default function DonationDetailsPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const { user } = useAuth();
  const result = useApiData(`/donations/${id}`);
  const donation = result.data?.donation;
  const isOwner =
    donation && user.role === 'donor' && donation.donor?._id === user.id;
  async function cancel() {
    await api(`/donations/${id}/cancel`, { method: 'POST' });
    result.refresh();
  }
  return (
    <section className="workspace-page">
      <Link
        className="text-link"
        to={
          user.role === 'donor'
            ? '/dashboard/donor/donations'
            : '/dashboard/ngo/explore'
        }
      >
        ← Back to donations
      </Link>
      {state?.imageError && (
        <p role="alert" className="form-alert">
          The donation was saved. Its image could not be uploaded:{' '}
          {state.imageError}. You can retry below.
        </p>
      )}
      <DataState {...result} retry={result.refresh}>
        {donation && (
          <>
            <div className="workspace-title">
              <div>
                <span className="eyebrow">{readable(donation.category)}</span>
                <h1>{donation.title}</h1>
                <p>
                  Shared by{' '}
                  {donation.donor?.organizationName ||
                    donation.donor?.name ||
                    'FoodBridge donor'}
                </p>
              </div>
              <StatusBadge status={donation.status} />
            </div>
            <div className="detail-grid">
              <section className="profile-card donation-details">
                <DonationPhoto
                  key={donation.image?.secureUrl || donation._id}
                  donation={donation}
                  className="donor-detail-photo"
                />
                <p>{donation.description}</p>
                <dl className="inventory-totals">
                  <div>
                    <dt>Available</dt>
                    <dd>
                      {donation.remainingQuantity} {donation.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>Reserved</dt>
                    <dd>
                      {donation.reservedQuantity} {donation.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>Received</dt>
                    <dd>
                      {donation.completedQuantity} {donation.unit}
                    </dd>
                  </div>
                </dl>
                <dl className="declaration-details">
                  {[
                    ['Prepared at', formatTime(donation.preparationTime)],
                    ['Pickup deadline', formatTime(donation.pickupDeadline)],
                    ['Storage conditions', donation.storageConditions],
                    ['Packaging', donation.packagingDetails],
                    ['Handling', donation.handlingDetails],
                    ['Allergens', donation.allergenInformation],
                    ['Pickup location', donation.pickupLocation],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                {donation.imageUrl && (
                  <a
                    className="text-link"
                    href={donation.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View donor-provided image ↗
                  </a>
                )}
                <p className="declaration-note">
                  All preparation, storage, handling and allergen details are
                  donor declarations. The pickup deadline does not certify that
                  food is safe.
                </p>
              </section>
              <aside>
                <LocationMap
                  approximate={!donation.location}
                  points={[
                    {
                      label: donation.title,
                      location: donation.location || donation.areaLocation,
                    },
                  ]}
                />
                {isOwner && (
                  <div className="profile-card owner-actions">
                    <h2>Manage this donation</h2>
                    <Link
                      className="button button-outline"
                      to="/dashboard/donor/requests"
                    >
                      Incoming requests
                    </Link>
                    {['available', 'reserved'].includes(donation.status) &&
                      donation.reservedQuantity === 0 &&
                      donation.completedQuantity === 0 && (
                        <Link
                          className="button button-outline"
                          to={`/dashboard/donor/donations/${id}/edit`}
                        >
                          Edit details
                        </Link>
                      )}
                    <p>
                      Edits are locked while any request is active, or after a
                      receipt. Active reservations must be resolved before
                      cancellation.
                    </p>
                    {!['cancelled', 'completed'].includes(donation.status) && (
                      <ConfirmAction
                        label="Cancel donation"
                        description="Close this listing and cancel its pending requests. Accepted and handed-over reservations must be resolved first."
                        onConfirm={cancel}
                      />
                    )}
                  </div>
                )}
                {isOwner && (
                  <DonationImageManager
                    donation={donation}
                    config={result.data.imageUpload}
                    refresh={result.refresh}
                  />
                )}
                {user.role === 'ngo' && (
                  <RequestForm
                    key={donation._id}
                    donation={donation}
                    refresh={result.refresh}
                  />
                )}
              </aside>
            </div>
          </>
        )}
      </DataState>
    </section>
  );
}
