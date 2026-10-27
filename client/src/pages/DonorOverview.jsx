import { Link } from 'react-router-dom';
import {
  Plus,
  ArrowUpRight,
  Leaf,
  HandHeart,
  Clock3,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { useApiData } from '../hooks/useApiData.js';
import { DataState, StatusBadge } from '../components/DonationShared.jsx';
import { formatTime } from '../utils/donation.js';
import { DonationPhoto } from '../components/DonorDonationCard.jsx';
function Panel({ title, link, label, children }) {
  return (
    <section className="donor-panel">
      <div className="donor-panel-heading">
        <h2>{title}</h2>
        <Link to={link}>
          {label}
          <ArrowUpRight size={15} />
        </Link>
      </div>
      {children}
    </section>
  );
}
export default function DonorOverview() {
  const { user } = useAuth();
  const analytics = useApiData('/analytics/donor');
  const donations = useApiData('/donations/mine?limit=4');
  const requests = useApiData('/requests?status=pending&limit=4');
  const summary = analytics.data?.summary;
  const metrics = [
    ['Total donations', summary?.totalDonations, Leaf],
    ['Active listings', summary?.activeDonations, Clock3],
    ['Pending requests', requests.data?.pagination?.total, HandHeart],
    ['Completed donations', summary?.completedDonations, CheckCircle2],
  ];
  const monthly = analytics.data?.monthly || [];
  const max = Math.max(1, ...monthly.map((row) => row.donations || 0));
  return (
    <section className="donor-overview">
      <div className="donor-welcome">
        <div>
          <p className="donor-kicker">
            Welcome back, {user.name.split(' ')[0]}.
          </p>
          <h1>
            A little surplus. <br />
            <em>A lot of possibility.</em>
          </h1>
          <p>Your food, your community, your next good connection.</p>
        </div>
        <Link className="button" to="/dashboard/donor/donations/new">
          <Plus size={17} />
          Create donation
        </Link>
      </div>
      <div className="donor-account-note">
        <span className={`status-badge status-${user.verificationStatus}`}>
          {user.verificationStatus} account
        </span>
        <span>
          You can share food as a donor. Verification is managed by the platform
          administrator.
        </span>
      </div>
      <div className="donor-metrics">
        {metrics.map(([label, value, Icon]) => (
          <article key={label}>
            <span className="donor-metric-label">
              {label}
              <Icon size={17} />
            </span>
            <strong>
              {typeof value === 'number' ? value.toLocaleString() : '—'}
            </strong>
            <span>
              {label === 'Pending requests'
                ? 'Current incoming queue'
                : 'Listings created in analytics period'}
            </span>
          </article>
        ))}
      </div>
      <div className="donor-metric-context">
        {analytics.data?.range && (
          <p>
            Listing totals: {analytics.data.range.from} –{' '}
            {analytics.data.range.to} (UTC). Pending requests are a live count.
          </p>
        )}
        {analytics.error && (
          <div role="alert">
            Analytics unavailable.{' '}
            <button className="text-link" onClick={analytics.refresh}>
              Retry analytics
            </button>
          </div>
        )}
      </div>
      <div className="donor-overview-grid">
        <Panel
          title="Donation activity"
          link="/dashboard/donor/analytics"
          label="Full analytics"
        >
          <DataState {...analytics} retry={analytics.refresh}>
            {monthly.some((row) => row.donations) ? (
              <>
                <div
                  className="donor-activity-chart"
                  role="img"
                  aria-label="Donations created by month; exact counts are in the data table below"
                >
                  {monthly.map((row) => (
                    <div className="donor-chart-column" key={row.month}>
                      <span>{row.donations || 0}</span>
                      <div>
                        <i
                          style={{
                            height: `${((row.donations || 0) / max) * 100}%`,
                          }}
                        />
                      </div>
                      <small>{row.month.slice(5)}</small>
                    </div>
                  ))}
                </div>
                <details className="donor-chart-data">
                  <summary>View monthly counts</summary>
                  <table>
                    <caption>Donations created per month (UTC)</caption>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Donations</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((row) => (
                        <tr key={row.month}>
                          <th scope="row">{row.month}</th>
                          <td>{row.donations || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            ) : (
              <div className="donor-empty">
                <Leaf size={28} />
                <h3>Your next chapter starts here.</h3>
                <p>
                  Publish your first donation to begin your activity history.
                </p>
                <Link to="/dashboard/donor/donations/new">
                  Create a donation <ArrowUpRight size={15} />
                </Link>
              </div>
            )}
          </DataState>
        </Panel>
        <Panel
          title="Incoming requests"
          link="/dashboard/donor/requests"
          label="View all"
        >
          <DataState {...requests} retry={requests.refresh}>
            {requests.data?.items?.length ? (
              <ul className="donor-recent-requests">
                {requests.data.items.map((r) => (
                  <li key={r._id}>
                    <div className="donor-mini-avatar">
                      <HandHeart size={20} />
                    </div>
                    <div>
                      <strong>
                        {r.ngo?.organizationName ||
                          r.ngo?.name ||
                          'Community organization'}
                      </strong>
                      <Link to="/dashboard/donor/requests">
                        {r.donation?.title || 'Donation unavailable'}
                      </Link>
                      <span>
                        {r.requestedQuantity} {r.unit || r.donation?.unit}{' '}
                        requested · {formatTime(r.createdAt)}
                      </span>
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="donor-empty">
                <HandHeart size={28} />
                <h3>A little room for connection.</h3>
                <p>
                  New NGO requests will appear here when an organization
                  responds to your listing.
                </p>
              </div>
            )}
          </DataState>
        </Panel>
      </div>
      <Panel
        title="Recently shared"
        link="/dashboard/donor/donations"
        label="My donations"
      >
        <DataState {...donations} retry={donations.refresh}>
          {donations.data?.items?.length ? (
            <div className="donor-recent-list">
              {donations.data.items.map((d) => (
                <article key={d._id}>
                  <DonationPhoto
                    key={d.image?.secureUrl || d._id}
                    donation={d}
                  />
                  <div>
                    <Link to={`/dashboard/donor/donations/${d._id}`}>
                      {d.title}
                    </Link>
                    <span>
                      {d.remainingQuantity} {d.unit} available · Pickup by{' '}
                      {formatTime(d.pickupDeadline)}
                    </span>
                  </div>
                  <StatusBadge status={d.status} />
                  <Link
                    className="donor-row-link"
                    to={`/dashboard/donor/donations/${d._id}`}
                    aria-label={`View ${d.title}`}
                  >
                    <ArrowUpRight size={19} />
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="donor-empty donor-empty-inline">
              <Leaf size={28} />
              <div>
                <h3>Good food deserves a next step.</h3>
                <p>
                  Your published listings will appear here. Start with the
                  details you know.
                </p>
              </div>
              <Link
                className="button button-outline"
                to="/dashboard/donor/donations/new"
              >
                Create your first donation
              </Link>
            </div>
          )}
        </DataState>
      </Panel>
    </section>
  );
}
