import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { useApiData } from '../hooks/useApiData.js';
import { api } from '../utils/api.js';
import {
  DataState,
  StatusBadge,
  Pagination,
  ConfirmAction,
} from '../components/DonationShared.jsx';
import { formatTime } from '../utils/donation.js';
import LocationMap from '../components/LocationMap.jsx';
function Assignment({ assignment: a, refresh, detail = false }) {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const base = `/dashboard/${user.role}/pickups/${a._id}`;
  async function act(action) {
    await api(`/pickups/${a._id}${action === 'claim' ? '/claim' : ''}`, {
      method: action === 'claim' ? 'POST' : 'PATCH',
      body: action === 'claim' ? {} : { action, ...(reason ? { reason } : {}) },
    });
    refresh();
  }
  const canMove =
    a.assignedToMe &&
    ['assigned', 'en_route_to_pickup'].includes(a.status) &&
    a.requestStatus === 'accepted';
  const canCancel =
    ['donor', 'ngo'].includes(user.role) &&
    ['awaiting_volunteer', 'assigned', 'en_route_to_pickup'].includes(
      a.status,
    ) &&
    a.requestStatus === 'accepted';
  return (
    <article className="pickup-card profile-card">
      <div className="request-card-heading">
        <div>
          <span className="eyebrow">
            {a.requestedQuantity} {a.unit} ·{' '}
            {a.requestStatus.replaceAll('_', ' ')}
          </span>
          <h2>
            {detail ? (
              a.donation?.title
            ) : (
              <Link to={base}>{a.donation?.title || 'Pickup assignment'}</Link>
            )}
          </h2>
        </div>
        <StatusBadge status={a.status} />
      </div>
      <p className="pickup-deadline">
        Pickup cutoff:{' '}
        {a.donation ? formatTime(a.donation.pickupDeadline) : 'Unavailable'}
      </p>
      <div className="pickup-stops">
        <div>
          <span>Collection</span>
          <strong>{a.origin.address}</strong>
        </div>
        <div>
          <span>Delivery</span>
          <strong>{a.destination.address}</strong>
        </div>
      </div>
      <p className="field-hint">
        {a.locationPrecision === 'exact'
          ? 'Exact details are visible to authorized participants.'
          : 'Approximate areas only; exact addresses are hidden until an eligible claim.'}{' '}
        {a.previouslyAssignedToMe && !a.assignedToMe
          ? 'You previously handled this assignment.'
          : ''}
      </p>
      <p className="pickup-person">
        {a.volunteer
          ? `Assigned volunteer: ${a.volunteer.name}`
          : ['assigned', 'en_route_to_pickup', 'picked_up'].includes(a.status)
            ? 'A volunteer is assigned; personal details are restricted'
            : 'Waiting for an eligible volunteer'}
      </p>
      {a.issue && (
        <p className="form-alert" role="alert">
          Delivery issue: {a.issue}. Custody and reserved inventory remain held
          until the NGO confirms actual receipt.
        </p>
      )}
      {a.arrivalReportedAt && (
        <p className="notice-panel">
          Volunteer reported arrival at {formatTime(a.arrivalReportedAt)}. This
          is not an NGO receipt confirmation.
        </p>
      )}
      {detail && (
        <LocationMap
          approximate={a.locationPrecision !== 'exact'}
          points={[
            { label: 'Collection', location: a.origin.location },
            { label: 'Delivery', location: a.destination.location },
          ]}
        />
      )}
      <div className="hero-actions pickup-actions">
        {a.canClaim && (
          <ConfirmAction
            label="Claim pickup"
            description="Take responsibility for collecting and delivering this accepted reservation. The donor must confirm actual handover and the NGO must confirm actual receipt."
            onConfirm={() => act('claim')}
          />
        )}
        {canMove && a.status === 'assigned' && (
          <ConfirmAction
            label="Start pickup"
            description="Record that you are en route to collection. No food inventory changes until the existing donor and NGO confirmations."
            onConfirm={() => act('start')}
          />
        )}
        {canMove && (
          <ConfirmAction
            label="Release assignment"
            description="Return this pickup to the volunteer pool before physical handover. The NGO reservation remains active."
            onConfirm={() => act('release')}
          />
        )}
        {canCancel && (
          <ConfirmAction
            label="Cancel transportation"
            description="Cancel volunteer transportation only. The food reservation stays accepted and direct handover remains possible."
            onConfirm={() => act('cancel')}
          />
        )}
        {a.assignedToMe && a.status === 'picked_up' && !a.arrivalReportedAt && (
          <ConfirmAction
            label="Report arrival"
            description="Report arrival at the destination. Only the NGO can confirm receipt; this will not mark the donation delivered."
            onConfirm={() => act('arrive')}
          />
        )}
      </div>
      {a.assignedToMe &&
        ['assigned', 'en_route_to_pickup', 'picked_up'].includes(a.status) && (
          <div className="pickup-issue">
            <label htmlFor={`issue-${a._id}`}>Pickup or delivery issue</label>
            <textarea
              id={`issue-${a._id}`}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <ConfirmAction
              label="Report failed pickup / issue"
              disabled={!reason.trim()}
              description={
                a.status === 'picked_up'
                  ? 'Record a delivery issue. Food already handed over cannot be released or put back into available inventory. Coordinate with the donor and NGO.'
                  : 'Release this failed collection for another volunteer, if the pickup deadline has not passed. The food reservation stays active.'
              }
              onConfirm={() => act('report_failure')}
            />
          </div>
        )}
      {['donor', 'ngo'].includes(user.role) && (
        <Link className="text-link" to={`/dashboard/${user.role}/requests`}>
          Open requests for{' '}
          {user.role === 'donor' ? 'donor handover' : 'NGO receipt'}{' '}
          confirmation →
        </Link>
      )}
      {detail && a.events && (
        <ol className="pickup-timeline" aria-label="Pickup history">
          {a.events.map((event, index) => (
            <li key={index}>
              <strong>{event.action.replaceAll('_', ' ')}</strong>
              <span>
                {formatTime(event.at)} · {event.status.replaceAll('_', ' ')}
              </span>
              {event.reason && <p>{event.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
export default function PickupsPage({ available = false }) {
  const { id } = useParams();
  const [page, setPage] = useState(1);
  const { user } = useAuth();
  const result = useApiData(
    id
      ? `/pickups/${id}`
      : `/pickups/${available ? 'available' : 'mine'}?page=${page}`,
  );
  const title = id
    ? 'Pickup details'
    : available
      ? 'Available pickups'
      : user.role === 'volunteer'
        ? 'My assignments'
        : user.role === 'donor'
          ? 'Pickup status'
          : 'Delivery tracking';
  return (
    <section className="workspace-page">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">
            FROM SHARED FOOD TO SHARED RESPONSIBILITY
          </span>
          <h1>{title}</h1>
          <p>
            {available
              ? 'Claim accepted NGO reservations that need volunteer transport. Verification is required.'
              : 'Follow actual confirmations from collection to receipt. Volunteer progress never substitutes for donor or NGO confirmation.'}
          </p>
        </div>
        <button
          className="button button-outline"
          disabled={result.loading}
          onClick={result.refresh}
        >
          Refresh status
        </button>
      </div>
      <p className="field-hint">
        Refresh to see the latest participant confirmations. No continuous
        location tracking is used.
      </p>
      <DataState
        {...result}
        retry={result.refresh}
        empty={!id && result.data?.items.length === 0}
      >
        {id && result.data ? (
          <Assignment
            assignment={result.data.assignment}
            refresh={result.refresh}
            detail
          />
        ) : (
          <>
            <div className="requests-list">
              {result.data?.items.map((a) => (
                <Assignment
                  key={a._id}
                  assignment={a}
                  refresh={result.refresh}
                />
              ))}
            </div>
            <Pagination pagination={result.data?.pagination} onPage={setPage} />
          </>
        )}
      </DataState>
    </section>
  );
}
