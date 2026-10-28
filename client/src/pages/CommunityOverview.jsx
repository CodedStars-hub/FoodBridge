import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Search,
  Truck,
  HandHeart,
  CheckCircle2,
  Clock3,
  Compass,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { useApiData } from '../hooks/useApiData.js';
import {
  DataState,
  DonationCard,
  StatusBadge,
} from '../components/DonationShared.jsx';
import { formatTime } from '../utils/donation.js';

function Panel({ title, to, label = 'View all', children }) {
  return (
    <section className="donor-panel">
      <div className="donor-panel-heading">
        <h2>{title}</h2>
        <Link to={to}>
          {label}
          <ArrowUpRight size={16} />
        </Link>
      </div>
      {children}
    </section>
  );
}
function Metric({ label, value, hint, icon: Icon }) {
  return (
    <article>
      <span className="donor-metric-label">
        {label}
        <Icon size={18} aria-hidden="true" />
      </span>
      <strong>
        {typeof value === 'number' ? value.toLocaleString() : '—'}
      </strong>
      <span>{hint}</span>
    </article>
  );
}
function Welcome({ volunteer }) {
  const { user, retry } = useAuth();
  return (
    <>
      <div className="donor-welcome">
        <div>
          <p className="donor-kicker">
            Welcome back, {user.name.split(' ')[0]}.
          </p>
          <h1>
            {volunteer ? (
              <>
                Small actions. <br />
                <em>Meaningful connections.</em>
              </>
            ) : (
              <>
                Good food. <br />
                <em>Greater possibility.</em>
              </>
            )}
          </h1>
          <p>
            {volunteer
              ? 'Your next collection can make someone’s day.'
              : user.organizationName ||
                'Your community, connected through food.'}
          </p>
        </div>
        <Link
          className="button"
          to={
            volunteer
              ? '/dashboard/volunteer/pickups/available'
              : '/dashboard/ngo/explore'
          }
        >
          {volunteer ? <Truck size={18} /> : <Search size={18} />}
          {volunteer ? 'Browse pickups' : 'Browse donations'}
        </Link>
      </div>
      <div className="community-verification">
        <StatusBadge status={user.verificationStatus} />
        <p>
          {user.verificationStatus === 'verified'
            ? volunteer
              ? 'Your account is verified. Claim an available pickup when you can make the collection.'
              : 'Your organization is verified. Request food that suits your community.'
            : volunteer
              ? 'An administrator must approve your account. Contact the platform administrator for identity and eligibility review. Only verified volunteers can browse and claim available pickups.'
              : 'You can explore food now. Contact the platform administrator for organization review. Only verified NGOs can request food; an administrator must approve your account.'}
        </p>
        <button className="text-link" onClick={retry}>
          Refresh verification status
        </button>
        <Link to={`/dashboard/${user.role}#profile`}>
          Account details <ArrowUpRight size={14} />
        </Link>
      </div>
    </>
  );
}
function Empty({ title, children, to, label }) {
  return (
    <div className="donor-empty">
      <Compass size={28} aria-hidden="true" />
      <h3>{title}</h3>
      <p>{children}</p>
      {to && (
        <Link to={to}>
          {label}
          <ArrowUpRight size={15} />
        </Link>
      )}
    </div>
  );
}
function PendingDeliveries() {
  const waiting = useApiData('/pickups/mine?status=awaiting_volunteer&limit=1');
  const assigned = useApiData('/pickups/mine?status=assigned&limit=1');
  const moving = useApiData('/pickups/mine?status=en_route_to_pickup&limit=1');
  const collected = useApiData('/pickups/mine?status=picked_up&limit=1');
  const results = [waiting, assigned, moving, collected];
  const complete = results.every(
    (r) => typeof r.data?.pagination?.total === 'number',
  );
  const failed = results.some((r) => r.error);
  return (
    <div className="community-pending-metric">
      <Metric
        label="Pending deliveries"
        value={
          complete
            ? results.reduce((sum, r) => sum + r.data.pagination.total, 0)
            : undefined
        }
        hint="Live · awaiting volunteer through handover"
        icon={Truck}
      />
      {failed && (
        <button
          className="text-link"
          onClick={() => results.forEach((r) => r.refresh())}
        >
          Retry delivery count
        </button>
      )}
    </div>
  );
}
export function NgoOverview() {
  const analytics = useApiData('/analytics/ngo');
  const requests = useApiData('/requests?limit=4');
  const donations = useApiData('/donations?limit=3');
  const summary = analytics.data?.summary;
  return (
    <section className="workspace-page community-overview">
      <Welcome />
      <div className="donor-metrics">
        <Metric
          label="Total requests"
          value={summary?.totalRequests}
          hint="Created in analytics period"
          icon={HandHeart}
        />
        <Metric
          label="Accepted requests"
          value={summary?.acceptedRequests}
          hint="Accepted or handed over · period requests"
          icon={Clock3}
        />
        <Metric
          label="Completed receipts"
          value={summary?.completedReceipts}
          hint="Receipt confirmed in analytics period"
          icon={CheckCircle2}
        />
        <PendingDeliveries />
      </div>
      <AnalyticsContext result={analytics} />
      <div className="community-feature-links">
        <Link to="/dashboard/ngo/recommended">
          <Compass size={22} />
          <span>
            <strong>Find your fit</strong>
            <small>
              Recommendations explained by distance, quantity and pickup window.
            </small>
          </span>
          <ArrowUpRight size={18} />
        </Link>
        <Link to="/dashboard/ngo/pickups">
          <Truck size={22} />
          <span>
            <strong>Follow every collection</strong>
            <small>From accepted request to your confirmed receipt.</small>
          </span>
          <ArrowUpRight size={18} />
        </Link>
      </div>
      <Panel title="Your recent requests" to="/dashboard/ngo/requests">
        <DataState {...requests} retry={requests.refresh}>
          {requests.data?.items?.length ? (
            <ul className="community-activity-list">
              {requests.data.items.map((r) => (
                <li key={r._id}>
                  <span className="donor-mini-avatar">
                    <HandHeart size={19} />
                  </span>
                  <div>
                    <Link to="/dashboard/ngo/requests">
                      {r.donation?.title || 'Donation unavailable'}
                    </Link>
                    <span>
                      {r.requestedQuantity} {r.unit || r.donation?.unit} ·{' '}
                      {formatTime(r.createdAt)}
                    </span>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title="Your community’s next connection."
              to="/dashboard/ngo/explore"
              label="Explore available food"
            >
              Your requests will appear here. Start by finding food that meets
              your organization’s needs.
            </Empty>
          )}
        </DataState>
      </Panel>
      <Panel
        title="Available to share"
        to="/dashboard/ngo/explore"
        label="Explore donations"
      >
        <DataState {...donations} retry={donations.refresh}>
          {donations.data?.items?.length ? (
            <div className="donations-grid">
              {donations.data.items.map((d) => (
                <DonationCard key={d._id} donation={d} />
              ))}
            </div>
          ) : (
            <Empty
              title="Something good may be just around the corner."
              to="/dashboard/ngo/explore"
              label="Browse donations"
            >
              No available listings were returned. Check back as donors share
              surplus food.
            </Empty>
          )}
        </DataState>
      </Panel>
    </section>
  );
}
function AnalyticsContext({ result }) {
  return (
    <div className="donor-metric-context">
      {result.data?.range && (
        <p>
          Analytics period: {result.data.range.from} – {result.data.range.to}{' '}
          (UTC). Available and active pickup counts are live snapshots.
        </p>
      )}
      {result.error && (
        <p role="alert">
          Analytics unavailable.{' '}
          <button className="text-link" onClick={result.refresh}>
            Retry analytics
          </button>
        </p>
      )}
    </div>
  );
}
export function VolunteerOverview() {
  const analytics = useApiData('/analytics/volunteer');
  const assignments = useApiData('/pickups/mine?limit=4');
  const summary = analytics.data?.summary;
  const history = analytics.data?.pickupHistory || [];
  return (
    <section className="workspace-page community-overview">
      <Welcome volunteer />
      <div className="donor-metrics community-volunteer-metrics">
        <Metric
          label="Available pickups"
          value={summary?.availableAssignments}
          hint="Live · eligibility enforced on claim"
          icon={Compass}
        />
        <Metric
          label="Active assignments"
          value={summary?.activeAssignments}
          hint="Live · assigned to you"
          icon={Truck}
        />
        <Metric
          label="Completed deliveries"
          value={summary?.completedPickups}
          hint="NGO receipts in analytics period"
          icon={CheckCircle2}
        />
      </div>
      <AnalyticsContext result={analytics} />
      <div className="community-workflow-note">
        <span>01 · Claim a pickup</span>
        <span>02 · Donor confirms handover</span>
        <span>03 · NGO confirms receipt</span>
      </div>
      <div className="community-overview-columns">
        <Panel
          title="Your latest assignments"
          to="/dashboard/volunteer/pickups"
        >
          <DataState {...assignments} retry={assignments.refresh}>
            {assignments.data?.items?.length ? (
              <ul className="community-activity-list">
                {assignments.data.items.map((a) => (
                  <li key={a._id}>
                    <span className="donor-mini-avatar">
                      <Truck size={19} />
                    </span>
                    <div>
                      <Link to={`/dashboard/volunteer/pickups/${a._id}`}>
                        {a.donation?.title || 'Pickup assignment'}
                      </Link>
                      <span>
                        {a.requestedQuantity} {a.unit} · {a.origin?.address}
                      </span>
                      <small>
                        {a.assignedToMe
                          ? 'Assigned to you'
                          : 'Previously handled by you'}{' '}
                        · Pickup by{' '}
                        {a.donation
                          ? formatTime(a.donation.pickupDeadline)
                          : 'Unavailable'}
                      </small>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                title="Your next good turn starts here."
                to="/dashboard/volunteer/pickups/available"
                label="Browse pickups"
              >
                Claim a collection when you have time to help. Your assignments
                will appear here.
              </Empty>
            )}
          </DataState>
        </Panel>
        <Panel
          title="Recent pickup activity"
          to="/dashboard/volunteer/analytics"
          label="View analytics"
        >
          <DataState {...analytics} retry={analytics.refresh}>
            {history.length ? (
              <ul className="community-activity-list">
                {history.map((a) => (
                  <li key={a._id}>
                    <div>
                      <Link to={`/dashboard/volunteer/pickups/${a._id}`}>
                        {a.title || 'Pickup assignment'}
                      </Link>
                      <span>
                        {a.quantity} {a.unit} · {formatTime(a.updatedAt)}
                      </span>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="A fresh page for shared good.">
                Your recorded pickup activity will appear here as you take part.
              </Empty>
            )}
          </DataState>
        </Panel>
      </div>
    </section>
  );
}
