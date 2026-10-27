import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { useApiData } from '../hooks/useApiData.js';
import { api } from '../utils/api.js';
import {
  StatusBadge,
  DataState,
  Pagination,
  ConfirmAction,
} from '../components/DonationShared.jsx';
import { formatTime, readable } from '../utils/donation.js';
const actionLabels = {
  accept: 'Accept request',
  reject: 'Reject request',
  cancel: 'Cancel request',
  handover: 'Mark handed over',
  receive: 'Confirm receipt',
};
const actionDescriptions = {
  accept:
    'Reserve the requested quantity for this NGO. Inventory will be checked again before acceptance.',
  reject: 'Decline this pending request. No inventory has been reserved.',
  cancel:
    'Cancel your request. Any accepted quantity will be released; handed-over food cannot be cancelled.',
  handover:
    'Confirm you have physically handed over this food. Cancellation will no longer be possible. The NGO must confirm receipt.',
  receive:
    'Confirm your organization received this food. This completes the reservation and permanently records the donated quantity.',
};
function RequestCard({ request, refresh, history, onSuccess }) {
  const { user } = useAuth();
  const donation = request.donation;
  const actions =
    user.role === 'donor'
      ? request.status === 'pending'
        ? ['accept', 'reject']
        : request.status === 'accepted'
          ? ['handover']
          : []
      : ['pending', 'accepted'].includes(request.status)
        ? ['cancel']
        : request.status === 'handed_over'
          ? ['receive']
          : [];
  const expired = !donation || new Date(donation.pickupDeadline) <= new Date();
  async function transition(action) {
    await api(`/requests/${request._id}`, {
      method: 'PATCH',
      body: { action },
    });
    refresh();
    onSuccess?.(
      `${actionLabels[action]} completed. The latest inventory and request state have been requested.`,
    );
  }
  return (
    <article className="request-card">
      <div className="request-card-heading">
        <div>
          <span className="eyebrow">
            {user.role === 'donor'
              ? request.ngo?.organizationName || request.ngo?.name || 'NGO'
              : donation?.donor?.organizationName ||
                donation?.donor?.name ||
                'Donor'}
          </span>
          <h2>
            {donation ? (
              <Link to={`/dashboard/${user.role}/donations/${donation._id}`}>
                {donation.title}
              </Link>
            ) : (
              'Donation unavailable'
            )}
          </h2>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <p className="request-quantity">
        {request.requestedQuantity} {request.unit || donation?.unit} requested
      </p>
      {request.message && <blockquote>{request.message}</blockquote>}
      <div className="request-times">
        <span>Requested {formatTime(request.createdAt)}</span>
        <span>Updated {formatTime(request.updatedAt)}</span>
        {donation && (
          <span>Pickup by {formatTime(donation.pickupDeadline)}</span>
        )}
      </div>
      {expired && !history && (
        <p className="field-hint">
          The pickup deadline has passed. New acceptance and handover are
          disabled. Cancellation or receipt confirmation may still be available.
        </p>
      )}
      {request.pickup && (
        <div className="pickup-summary">
          <StatusBadge status={request.pickup.status} />
          <Link
            className="text-link"
            to={`/dashboard/${user.role}/pickups/${request._id}`}
          >
            View pickup and delivery details →
          </Link>
          {request.pickup.issue && (
            <p className="form-alert">Delivery issue: {request.pickup.issue}</p>
          )}
        </div>
      )}
      {user.role === 'ngo' &&
        request.status === 'accepted' &&
        (!request.pickup || request.pickup.status === 'cancelled') &&
        !expired && (
          <ConfirmAction
            label="Arrange volunteer pickup"
            description="Share the donation collection point and your saved NGO delivery address with a verified volunteer once claimed. Coordinates for both stops and an NGO address are required. Your reservation remains unchanged."
            onConfirm={async () => {
              await api(`/requests/${request._id}/pickup`, { method: 'POST' });
              refresh();
              onSuccess?.(
                'Volunteer pickup arranged. Follow its progress in delivery tracking.',
              );
            }}
          />
        )}
      {request.resolutionReason && (
        <p className="field-hint">{request.resolutionReason}</p>
      )}
      {((user.role === 'donor' && history) || user.role === 'ngo') && (
        <ol
          className={
            user.role === 'donor'
              ? 'donor-reservation-timeline'
              : 'community-timeline'
          }
          aria-label="Reservation timeline"
        >
          {[
            [request.createdAt, 'Requested'],
            [request.acceptedAt, 'Accepted'],
            [request.handedOverAt, 'Handed over'],
            [request.receivedAt, 'Receipt confirmed'],
            ...(!request.receivedAt
              ? [
                  [
                    request.updatedAt,
                    `Last updated: ${readable(request.status)}`,
                  ],
                ]
              : []),
          ]
            .filter(([date]) => date)
            .map(([date, label]) => (
              <li key={label}>
                {label}
                <time dateTime={date}>{formatTime(date)}</time>
              </li>
            ))}
        </ol>
      )}
      <div className="hero-actions">
        {!history &&
          actions.map((action) => (
            <ConfirmAction
              key={action}
              label={actionLabels[action]}
              description={actionDescriptions[action]}
              onConfirm={() => transition(action)}
              className={
                (user.role === 'donor' &&
                  ['accept', 'handover'].includes(action)) ||
                (user.role === 'ngo' && action === 'receive')
                  ? 'button'
                  : 'button button-outline'
              }
              disabled={expired && ['accept', 'handover'].includes(action)}
            />
          ))}
      </div>
    </article>
  );
}
export default function RequestsPage({ history = false }) {
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page, ...(status ? { status } : {}) });
  const result = useApiData(`/requests${history ? '/history' : ''}?${query}`);
  return (
    <section className="workspace-page">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">
            {history ? 'YOUR SHARED HISTORY' : 'FROM REQUEST TO RECEIPT'}
          </span>
          <h1>
            {history
              ? 'Donation history'
              : user.role === 'donor'
                ? 'Incoming requests'
                : 'My requests'}
          </h1>
          <p>
            {history
              ? 'Completed and closed requests, with their real recorded status and timestamps.'
              : 'Track requests, reservations, handover and receipt in one place.'}
          </p>
        </div>
      </div>
      {notice && (
        <p role="status" className="donor-feedback">
          {notice}
        </p>
      )}
      <div className="donation-filters">
        <label>
          Request status
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {(history
              ? ['completed', 'cancelled', 'rejected', 'expired']
              : [
                  'pending',
                  'accepted',
                  'handed_over',
                  'completed',
                  'cancelled',
                  'rejected',
                  'expired',
                ]
            ).map((value) => (
              <option key={value} value={value}>
                {readable(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <DataState
        {...result}
        retry={result.refresh}
        empty={result.data?.items.length === 0}
        emptyContent={
          user.role === 'donor' ? (
            <div className="workspace-state empty-state">
              <h2>
                {status
                  ? 'No requests with this status.'
                  : history
                    ? 'Your shared history starts here.'
                    : 'Ready for your next connection.'}
              </h2>
              <p>
                {status
                  ? 'Choose another status to see more requests.'
                  : history
                    ? 'Closed requests will appear here with their recorded timeline.'
                    : 'Incoming NGO requests will appear here when an organization responds to your food listing.'}
              </p>
              {status ? (
                <button
                  className="button button-outline"
                  onClick={() => {
                    setStatus('');
                    setPage(1);
                  }}
                >
                  Show all statuses
                </button>
              ) : (
                <Link
                  className="button button-outline"
                  to="/dashboard/donor/donations"
                >
                  View my donations
                </Link>
              )}
            </div>
          ) : (
            <div className="workspace-state empty-state">
              <h2>
                {status
                  ? 'No requests with this status.'
                  : history
                    ? 'Your receipt history starts here.'
                    : 'Find food for your community.'}
              </h2>
              <p>
                {status
                  ? 'Try another status to find a request.'
                  : 'Your food requests and recorded progress will appear here.'}
              </p>
              {status ? (
                <button
                  className="button button-outline"
                  onClick={() => {
                    setStatus('');
                    setPage(1);
                  }}
                >
                  Show all statuses
                </button>
              ) : (
                <Link className="button" to="/dashboard/ngo/explore">
                  Browse donations
                </Link>
              )}
            </div>
          )
        }
      >
        <div className="requests-list">
          {result.data?.items.map((request) => (
            <RequestCard
              key={request._id}
              request={request}
              refresh={result.refresh}
              history={history}
              onSuccess={setNotice}
            />
          ))}
        </div>
        <Pagination pagination={result.data?.pagination} onPage={setPage} />
      </DataState>
    </section>
  );
}
