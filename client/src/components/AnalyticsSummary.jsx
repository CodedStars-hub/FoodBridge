import {
  Users,
  Leaf,
  Clock3,
  CheckCircle2,
  HandHeart,
  Truck,
  BarChart3,
} from 'lucide-react';

const definitions = {
  donor: [
    ['totalDonations', 'Total donations', 'Created in selected period', Leaf],
    [
      'activeDonations',
      'Active donations',
      'Unexpired listings created in period',
      Clock3,
    ],
    [
      'completedDonations',
      'Completed donations',
      'Completed listings created in period',
      CheckCircle2,
    ],
    [
      'completedReceipts',
      'Confirmed receipts',
      'Receipts confirmed in selected period',
      HandHeart,
    ],
  ],
  ngo: [
    [
      'totalRequests',
      'Total requests',
      'Created in selected period',
      HandHeart,
    ],
    [
      'acceptedRequests',
      'Accepted / awaiting receipt',
      'Accepted or handed-over period requests',
      Clock3,
    ],
    [
      'completedReceipts',
      'Completed receipts',
      'Receipts confirmed in selected period',
      CheckCircle2,
    ],
  ],
  volunteer: [
    [
      'availableAssignments',
      'Available assignments · live',
      'Eligible opportunities right now',
      Truck,
    ],
    [
      'activeAssignments',
      'Active assignments · live',
      'Current assignments requiring your help',
      Clock3,
    ],
    [
      'completedPickups',
      'Completed pickups',
      'NGO receipts in selected period',
      CheckCircle2,
    ],
  ],
  admin: [
    [
      'totalUsers',
      'Registered users',
      'Accounts created in selected period',
      Users,
    ],
    [
      'totalDonations',
      'Total donations',
      'Listings created in selected period',
      Leaf,
    ],
    [
      'completedDonations',
      'Completed donations',
      'Completed listings created in period',
      CheckCircle2,
    ],
    [
      'activeDonations',
      'Active food listings',
      'Unexpired listings created in period',
      Clock3,
    ],
    [
      'completedReceipts',
      'Confirmed receipts',
      'Receipts confirmed in selected period',
      HandHeart,
    ],
    [
      'completionRate',
      'Donation completion rate',
      'Completed / created listings in period',
      BarChart3,
    ],
  ],
};
export function AnalyticsMetrics({ role, summary, only }) {
  return (
    <div className="analytics-grid">
      {definitions[role]
        .filter(([key]) => !only || only.includes(key))
        .map(([key, label, hint, Icon]) => (
          <article className="analytics-card" key={key}>
            <span className="analytics-metric-label">
              {label}
              <Icon size={18} aria-hidden="true" />
            </span>
            <strong>
              {typeof summary?.[key] === 'number'
                ? key === 'completionRate'
                  ? `${summary[key].toFixed(1)}%`
                  : summary[key].toLocaleString()
                : '—'}
            </strong>
            <small>{hint}</small>
          </article>
        ))}
    </div>
  );
}
export function RoleCounts({ rows = [] }) {
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="role-counts">
      {rows.map((row) => (
        <article key={row.role}>
          <span>{row.role === 'ngo' ? 'NGO' : row.role}</span>
          <strong>{row.count.toLocaleString()}</strong>
          <div className="role-count-track" aria-hidden="true">
            <i style={{ width: `${(row.count / maximum) * 100}%` }} />
          </div>
        </article>
      ))}
    </div>
  );
}
