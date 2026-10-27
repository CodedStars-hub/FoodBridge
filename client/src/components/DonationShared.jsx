import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock3, Leaf, MapPin, ArrowRight } from 'lucide-react';
import { readable, formatTime } from '../utils/donation.js';
import { useAuth } from '../auth/useAuth.js';
export function StatusBadge({ status }) {
  return (
    <span className={`status-badge status-${status}`}>{readable(status)}</span>
  );
}
export function DataState({
  loading,
  error,
  retry,
  empty,
  emptyContent,
  children,
}) {
  if (loading)
    return (
      <div className="workspace-state" role="status">
        Loading food rescue workspace…
      </div>
    );
  if (error)
    return (
      <div className="workspace-state">
        <p className="form-alert" role="alert">
          {error}
        </p>
        <button className="button button-outline" onClick={retry}>
          Try again
        </button>
      </div>
    );
  if (empty)
    return (
      emptyContent || (
        <div className="workspace-state empty-state">
          <Leaf size={36} />
          <h2>Nothing here just yet.</h2>
          <p>
            Try changing your filters or check back as the community shares more
            food.
          </p>
        </div>
      )
    );
  return children;
}
export function Pagination({ pagination, onPage }) {
  if (!pagination?.pages) return null;
  return (
    <nav className="pagination" aria-label="Results pages">
      <button
        className="button button-outline"
        disabled={pagination.page <= 1}
        onClick={() => onPage(pagination.page - 1)}
      >
        Previous
      </button>
      <span>
        Page {pagination.page} of {pagination.pages} · {pagination.total}{' '}
        results
      </span>
      <button
        className="button button-outline"
        disabled={pagination.page >= pagination.pages}
        onClick={() => onPage(pagination.page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
export function DonationCard({ donation }) {
  const { user } = useAuth();
  return (
    <article className="donation-card">
      {donation.image?.secureUrl && (
        <img
          className="donation-card-image"
          src={donation.image.secureUrl}
          alt={donation.title}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="donation-card-top">
        <span className="food-category">
          <Leaf size={17} />
          {readable(donation.category)}
        </span>
        <StatusBadge status={donation.status} />
      </div>
      <h2>
        <Link to={`/dashboard/${user.role}/donations/${donation._id}`}>
          {donation.title}
        </Link>
      </h2>
      <p className="donation-description">{donation.description}</p>
      <div className="inventory-figure">
        <strong>{donation.remainingQuantity}</strong>
        <span>{donation.unit} available</span>
      </div>
      <div className="donation-meta">
        <span>
          <Clock3 size={15} />
          Pickup by {formatTime(donation.pickupDeadline)}
        </span>
        <span>
          <MapPin size={15} />
          {donation.pickupLocation}
        </span>
      </div>
      <Link
        className="text-link"
        to={`/dashboard/${user.role}/donations/${donation._id}`}
      >
        View donation <ArrowRight size={16} />
      </Link>
    </article>
  );
}
export function ConfirmAction({
  label,
  title,
  description,
  onConfirm,
  disabled,
  className = 'button button-outline',
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      setOpen(false);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className={className}
        disabled={disabled}
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="confirm-dialog"
          aria-labelledby="confirm-title"
          onCancel={(event) => {
            if (busy) event.preventDefault();
            else setOpen(false);
          }}
        >
          <h2 id="confirm-title">{title || label}</h2>
          <p>{description}</p>
          {error && (
            <p className="form-alert" role="alert">
              {error}
            </p>
          )}
          <div className="hero-actions">
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Go back
            </button>
            <button className="button" disabled={busy} onClick={confirm}>
              {busy ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
