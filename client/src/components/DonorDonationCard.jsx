import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Leaf, Clock3, ArrowUpRight, Pencil } from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { StatusBadge, ConfirmAction } from './DonationShared.jsx';
import { api } from '../utils/api.js';
import { readable, formatTime } from '../utils/donation.js';
export function DonationPhoto({ donation, className = '' }) {
  const [failed, setFailed] = useState(false);
  return donation.image?.secureUrl && !failed ? (
    <img
      className={`donor-food-photo ${className}`}
      src={donation.image.secureUrl}
      alt={donation.title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`donor-food-placeholder ${className}`}>
      <Leaf size={30} strokeWidth={1.2} aria-hidden="true" />
      <span>No photo provided</span>
    </div>
  );
}
export default function DonorDonationCard({ donation: d, refresh }) {
  const { user } = useAuth();
  const owner = String(d.donor?._id || d.donor) === user.id;
  const open =
    ['available', 'reserved'].includes(d.status) &&
    new Date(d.pickupDeadline) > new Date();
  const editable =
    owner && open && d.reservedQuantity === 0 && d.completedQuantity === 0;
  return (
    <article className="donor-listing-card">
      <div className="donor-listing-photo">
        <DonationPhoto key={d.image?.secureUrl || d._id} donation={d} />
        <StatusBadge status={d.status} />
      </div>
      <div className="donor-listing-body">
        <span className="donor-category">{readable(d.category)}</span>
        <h2>
          <Link to={`/dashboard/donor/donations/${d._id}`}>{d.title}</Link>
        </h2>
        <p className="donor-listing-description">{d.description}</p>
        <div className="donor-listing-inventory">
          <strong>{d.remainingQuantity}</strong>
          <span>
            {d.unit} available
            <br />
            <small>
              {d.quantity} total · {d.reservedQuantity} reserved ·{' '}
              {d.completedQuantity} received
            </small>
          </span>
        </div>
        <p className="donor-listing-deadline">
          <Clock3 size={14} />
          Pickup by {formatTime(d.pickupDeadline)}
        </p>
        <div className="donor-listing-actions">
          <Link
            className="button button-outline"
            to={`/dashboard/donor/donations/${d._id}`}
          >
            View donation <ArrowUpRight size={15} />
          </Link>
          {editable && (
            <Link
              className="donor-edit-link"
              to={`/dashboard/donor/donations/${d._id}/edit`}
            >
              <Pencil size={14} />
              Edit
            </Link>
          )}
          {owner &&
            !['cancelled', 'completed'].includes(d.status) &&
            d.reservedQuantity === 0 && (
              <ConfirmAction
                label="Cancel"
                title="Cancel donation"
                className="donor-cancel-link"
                description="Close this listing and cancel its pending requests. Accepted or handed-over reservations must be resolved first."
                onConfirm={async () => {
                  await api(`/donations/${d._id}/cancel`, { method: 'POST' });
                  refresh();
                }}
              />
            )}
        </div>
        {editable && (
          <p className="donor-edit-note">
            Edits are checked against active requests when saved.
          </p>
        )}
      </div>
    </article>
  );
}
