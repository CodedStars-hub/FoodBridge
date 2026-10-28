import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  BarChart3,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { useApiData } from '../hooks/useApiData.js';
import { DataState, StatusBadge } from '../components/DonationShared.jsx';
import {
  AnalyticsMetrics,
  RoleCounts,
} from '../components/AnalyticsSummary.jsx';
export default function AdminOverview() {
  const { user } = useAuth();
  const result = useApiData('/analytics/admin');
  const data = result.data;
  const recent = (data?.monthly || [])
    .filter((row) => row.users || row.donations || row.receipts)
    .slice(-4)
    .reverse();
  return (
    <section className="workspace-page admin-overview">
      <div className="donor-welcome">
        <div>
          <p className="donor-kicker">
            Welcome back, {user.name.split(' ')[0]}.
          </p>
          <h1>
            A stronger foundation
            <br /> <em>for shared good.</em>
          </h1>
          <p>
            A clear view of the people and food that bring FoodBridge together.
          </p>
        </div>
        <Link className="button" to="/dashboard/admin/analytics">
          <BarChart3 size={18} />
          Platform analytics
        </Link>
      </div>
      <div className="admin-account-line">
        <StatusBadge status={user.verificationStatus} />
        <span>Administrator workspace</span>
        <button
          className="text-link"
          onClick={result.refresh}
          disabled={result.loading}
        >
          <RefreshCw size={14} />
          Refresh overview
        </button>
      </div>
      <DataState {...result} retry={result.refresh}>
        {data?.summary && (
          <>
            <div className="analytics-period">
              <span className="eyebrow">Platform snapshot</span>
              {data.range && (
                <p>
                  {data.range.from} – {data.range.to} · UTC. Registrations and
                  listings created in this period; receipts use confirmation
                  dates.
                </p>
              )}
            </div>
            <AnalyticsMetrics
              role="admin"
              summary={data.summary}
              only={[
                'totalUsers',
                'activeDonations',
                'completedDonations',
                'completedReceipts',
              ]}
            />
            <div className="admin-overview-grid">
              <section className="profile-card admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">The FoodBridge community</p>
                    <h2>People, by role</h2>
                  </div>
                  <Users size={23} aria-hidden="true" />
                </div>
                <p>
                  Registrations in the analytics period. These are aggregate
                  counts, not a user directory.
                </p>
                {data.usersByRole?.length ? (
                  <RoleCounts rows={data.usersByRole} />
                ) : (
                  <p className="analytics-empty">
                    Role counts are unavailable for this response.
                  </p>
                )}
                <Link className="text-link" to="/dashboard/admin/analytics">
                  Explore platform analytics <ArrowUpRight size={15} />
                </Link>
              </section>
              <section className="profile-card admin-panel">
                <div className="admin-panel-heading">
                  <div>
                    <p className="eyebrow">Recorded platform activity</p>
                    <h2>Recent platform activity</h2>
                  </div>
                  <BarChart3 size={23} aria-hidden="true" />
                </div>
                <p>
                  Monthly counts in UTC. This is an aggregate view of
                  registrations, listings and confirmed receipts.
                </p>
                {recent.length ? (
                  <div className="table-scroll">
                    <table>
                      <caption>Recent active months · platform counts</caption>
                      <thead>
                        <tr>
                          <th scope="col">Month</th>
                          <th scope="col">Users</th>
                          <th scope="col">Listings</th>
                          <th scope="col">Receipts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((row) => (
                          <tr key={row.month}>
                            <th scope="row">{row.month}</th>
                            <td>{row.users || 0}</td>
                            <td>{row.donations || 0}</td>
                            <td>{row.receipts || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="analytics-empty">
                    <h3>A clear starting point.</h3>
                    <p>No recorded platform activity in this date range.</p>
                  </div>
                )}
              </section>
            </div>
            {data.generatedAt && (
              <p className="admin-refreshed">
                Snapshot refreshed{' '}
                <time dateTime={data.generatedAt}>
                  {new Date(data.generatedAt).toLocaleString()}
                </time>
              </p>
            )}
          </>
        )}
      </DataState>
      <section
        className="admin-capabilities"
        aria-labelledby="account-oversight-title"
      >
        <div className="admin-panel-heading">
          <div>
            <p className="eyebrow">Account oversight</p>
            <h2 id="account-oversight-title">
              Verification & community management
            </h2>
          </div>
          <ShieldCheck size={24} aria-hidden="true" />
        </div>
        <div>
          <article>
            <h3>Organization verification</h3>
            <Link className="text-link" to="/dashboard/admin/verifications">
              Review NGO and volunteer accounts
            </Link>
            <p>
              Review pending accounts and approve or reject their eligibility.
            </p>
          </article>
          <article>
            <h3>User management</h3>
            <span className="admin-unavailable">
              Aggregate reporting available
            </span>
            <p>
              Role counts are available in analytics. Individual account search,
              user details and privileged account changes are not available in
              this workspace.
            </p>
          </article>
        </div>
      </section>
    </section>
  );
}
