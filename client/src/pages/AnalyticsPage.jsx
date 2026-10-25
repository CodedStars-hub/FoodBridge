import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { useAuth } from '../auth/useAuth.js';
import { useApiData } from '../hooks/useApiData.js';
import { DataState } from '../components/DonationShared.jsx';
const cards = {
  donor: [
    ['totalDonations', 'Total donations'],
    ['activeDonations', 'Active donations'],
    ['completedDonations', 'Completed donations'],
    ['completedReceipts', 'Confirmed receipts'],
  ],
  ngo: [
    ['totalRequests', 'Total requests'],
    ['acceptedRequests', 'Accepted / awaiting receipt'],
    ['completedReceipts', 'Completed receipts'],
  ],
  volunteer: [
    ['availableAssignments', 'Available assignments · live'],
    ['activeAssignments', 'Active assignments · live'],
    ['completedPickups', 'Completed pickups'],
  ],
  admin: [
    ['totalUsers', 'Registered users'],
    ['totalDonations', 'Total donations'],
    ['completedDonations', 'Completed donations'],
    ['activeDonations', 'Active food listings'],
    ['completedReceipts', 'Confirmed receipts'],
    ['completionRate', 'Donation completion rate'],
  ],
};
const chartSeries = {
  donor: [
    ['donations', 'Created donations', '#174d38'],
    ['receipts', 'Confirmed receipts', '#c96a3d'],
  ],
  ngo: [
    ['requests', 'Created requests', '#174d38'],
    ['receipts', 'Confirmed receipts', '#c96a3d'],
  ],
  volunteer: [['pickups', 'Completed pickups', '#174d38']],
  admin: [
    ['donations', 'Created donations', '#174d38'],
    ['receipts', 'Confirmed receipts', '#c96a3d'],
    ['users', 'Registered users', '#537c96'],
  ],
};
export default function AnalyticsPage() {
  const { user } = useAuth();
  const [draft, setDraft] = useState(() => {
    const now = new Date();
    return {
      from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))
        .toISOString()
        .slice(0, 10),
      to: now.toISOString().slice(0, 10),
    };
  });
  const [range, setRange] = useState(draft);
  const [error, setError] = useState('');
  const result = useApiData(
    `/analytics/${user.role}?${new URLSearchParams(range)}`,
  );
  function apply(event) {
    event.preventDefault();
    if (draft.from > draft.to) {
      setError('Start date must be before the end date');
      return;
    }
    setError('');
    setRange({ ...draft });
    if (draft.from === range.from && draft.to === range.to) result.refresh();
  }
  const data = result.data;
  const series = chartSeries[user.role];
  return (
    <section className="workspace-page">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">REAL ACTIVITY. CLEAR ACCOUNTING.</span>
          <h1>
            {user.role === 'admin' ? 'Platform analytics' : 'Your analytics'}
          </h1>
          <p>
            Recorded activity only. Food counts as redistributed after NGO
            receipt, with every unit reported separately.
          </p>
        </div>
        <button
          className="button button-outline"
          onClick={result.refresh}
          disabled={result.loading}
        >
          Refresh analytics
        </button>
      </div>
      <form
        className="analytics-filters"
        aria-label="Analytics date range"
        onSubmit={apply}
      >
        <label>
          From
          <input
            type="date"
            required
            value={draft.from}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          />
        </label>
        <label>
          To
          <input
            type="date"
            required
            value={draft.to}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          />
        </label>
        <button className="button">Apply date range</button>
        <span>Inclusive dates · UTC · maximum two years</span>
      </form>
      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}
      <DataState {...result} retry={result.refresh}>
        {data && (
          <>
            <div className="analytics-grid">
              {cards[user.role].map(([key, label]) => (
                <article className="analytics-card" key={key}>
                  <span>{label}</span>
                  <strong>
                    {key === 'completionRate'
                      ? `${data.summary[key].toFixed(1)}%`
                      : data.summary[key].toLocaleString()}
                  </strong>
                </article>
              ))}
            </div>
            {data.usersByRole && (
              <section className="profile-card analytics-section">
                <h2>Users by role</h2>
                <div className="role-counts">
                  {data.usersByRole.map((row) => (
                    <p key={row.role}>
                      <span>{row.role}</span>
                      <strong>{row.count}</strong>
                    </p>
                  ))}
                </div>
              </section>
            )}
            <figure className="profile-card analytics-chart">
              <figcaption id="monthly-chart-title">
                <h2>Monthly activity</h2>
                <p>Counts of recorded actions, not a combined food quantity.</p>
              </figcaption>
              {data.monthly.every((row) =>
                series.every(([key]) => !row[key]),
              ) && (
                <p className="analytics-empty">
                  No monthly activity in this range. No sample data is
                  displayed.
                </p>
              )}
              <div className="chart-canvas">
                <ResponsiveContainer
                  width="100%"
                  height={270}
                  minWidth={0}
                  initialDimension={{ width: 600, height: 270 }}
                >
                  <LineChart
                    data={data.monthly}
                    accessibilityLayer
                    aria-label="Monthly activity counts"
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e3e9da"
                    />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10 }}
                      minTickGap={25}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10 }}
                      width={35}
                    />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {series.map(([key, label, color]) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        name={label}
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <details className="chart-table">
                <summary>View chart data as a table</summary>
                <div className="table-scroll">
                  <table>
                    <caption>Monthly activity counts in UTC</caption>
                    <thead>
                      <tr>
                        <th scope="col">Month</th>
                        {series.map(([key, label]) => (
                          <th scope="col" key={key}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.monthly.map((row) => (
                        <tr key={row.month}>
                          <th scope="row">{row.month}</th>
                          {series.map(([key]) => (
                            <td key={key}>{row[key] || 0}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </figure>
            {user.role !== 'volunteer' && (
              <section className="profile-card analytics-section">
                <h2>Food successfully redistributed</h2>
                <p>
                  Confirmed receipt quantities, grouped by unit. Units are never
                  summed together.
                </p>
                {data.quantitiesByUnit.length === 0 ? (
                  <p className="analytics-empty">
                    No confirmed food receipts in this date range.
                  </p>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <caption>Received food by unit</caption>
                      <thead>
                        <tr>
                          <th scope="col">Unit</th>
                          <th scope="col">Quantity received</th>
                          <th scope="col">Confirmed receipts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.quantitiesByUnit.map((row) => (
                          <tr key={row.unit}>
                            <th scope="row">{row.unit}</th>
                            <td>{row.quantity.toLocaleString()}</td>
                            <td>{row.receipts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
            {data.pickupHistory && (
              <section className="profile-card analytics-section">
                <h2>Recent pickup history</h2>
                {data.pickupHistory.length === 0 ? (
                  <p className="analytics-empty">
                    No pickup activity in this range.
                  </p>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <caption>
                        Most recent ten assignments in the selected date range
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Donation</th>
                          <th scope="col">Pickup status</th>
                          <th scope="col">Quantity</th>
                          <th scope="col">Participation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.pickupHistory.map((row) => (
                          <tr key={row._id}>
                            <th scope="row">
                              {row.title || 'Donation unavailable'}
                            </th>
                            <td>{row.status.replaceAll('_', ' ')}</td>
                            <td>
                              {row.quantity} {row.unit}
                            </td>
                            <td>
                              {row.assignedToMe
                                ? 'Current / final volunteer'
                                : 'Previously assigned'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
            <aside
              className="analytics-notes"
              aria-label="Analytics definitions"
            >
              <h2>How these numbers are counted</h2>
              <ul>
                {data.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
              <p>
                Data refreshed {new Date(data.generatedAt).toLocaleString()}.
              </p>
            </aside>
          </>
        )}
      </DataState>
    </section>
  );
}
