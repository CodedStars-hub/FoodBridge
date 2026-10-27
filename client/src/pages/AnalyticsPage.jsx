import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange } from 'lucide-react';
import {
  AnalyticsMetrics,
  RoleCounts,
} from '../components/AnalyticsSummary.jsx';
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
const chartSeries = {
  donor: [
    ['donations', 'Created donations', '#233d2d'],
    ['receipts', 'Confirmed receipts', '#a64f2d'],
  ],
  ngo: [
    ['requests', 'Created requests', '#233d2d'],
    ['receipts', 'Confirmed receipts', '#a64f2d'],
  ],
  volunteer: [['pickups', 'Completed pickups', '#233d2d']],
  admin: [
    ['donations', 'Created donations', '#233d2d'],
    ['receipts', 'Confirmed receipts', '#a64f2d'],
    ['users', 'Registered users', '#657c50'],
  ],
};
export default function AnalyticsPage() {
  const { user } = useAuth();
  const dateFrom = useRef(null);
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
      dateFrom.current?.focus();
      return;
    }
    setError('');
    setRange({ ...draft });
    if (draft.from === range.from && draft.to === range.to) result.refresh();
  }
  const data = result.data;
  const series = chartSeries[user.role];
  const hasActivity = data?.monthly.some((row) =>
    series.some(([key]) => row[key] > 0),
  );
  return (
    <section className="workspace-page insights-page">
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
            ref={dateFrom}
            aria-invalid={!!error}
            aria-describedby={
              error ? 'analytics-range-error' : 'analytics-range-hint'
            }
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
        <span id="analytics-range-hint">
          <CalendarRange size={16} aria-hidden="true" />
          Inclusive dates · UTC · maximum two years
        </span>
      </form>
      {error && (
        <p className="form-alert" role="alert" id="analytics-range-error">
          {error}
        </p>
      )}
      <DataState {...result} retry={result.refresh}>
        {data && (
          <>
            <div className="analytics-period">
              <span className="eyebrow">Applied date range</span>
              <p>
                {data.range.from} – {data.range.to} · UTC
              </p>
              <p className="analytics-period-note">
                {user.role === 'volunteer'
                  ? 'Available and active counts are live snapshots; completions use NGO receipt dates.'
                  : user.role === 'ngo'
                    ? 'Request totals use request creation dates; completed receipts use receipt dates.'
                    : user.role === 'donor'
                      ? 'Donation totals use listing creation dates; confirmed receipts use receipt dates.'
                      : 'Registrations and listing totals use creation dates; confirmed receipts use receipt dates.'}
              </p>
            </div>
            <AnalyticsMetrics role={user.role} summary={data.summary} />
            {data.usersByRole && (
              <section className="profile-card analytics-section">
                <h2>Users by role</h2>
                <p>Accounts registered in the selected date range.</p>
                <RoleCounts rows={data.usersByRole} />
              </section>
            )}
            <figure
              className="profile-card analytics-chart"
              aria-labelledby="monthly-chart-title"
            >
              <figcaption id="monthly-chart-title">
                <h2>Monthly activity</h2>
                <p>
                  Counts of recorded actions, not a combined food quantity. Each
                  line is a separate activity type; exact monthly counts are in
                  the table below.
                </p>
              </figcaption>
              {!hasActivity && (
                <p className="analytics-empty">
                  No monthly activity in this range. No sample data is
                  displayed.
                </p>
              )}
              {hasActivity && (
                <div
                  className="chart-canvas"
                  role="group"
                  aria-label="Monthly activity chart; exact values are available in the table below"
                >
                  <ResponsiveContainer
                    width="100%"
                    height={270}
                    minWidth={0}
                    initialDimension={{ width: 600, height: 270 }}
                    debounce={80}
                  >
                    <LineChart
                      data={data.monthly}
                      accessibilityLayer
                      aria-label="Monthly activity counts"
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#dfe2d4"
                      />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 12, fill: '#636859' }}
                        minTickGap={25}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: '#636859' }}
                        width={35}
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#fcfbf7',
                          border: '1px solid #cdd4c0',
                          borderRadius: 6,
                          color: '#282d25',
                          fontSize: 13,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {series.map(([key, label, color]) => (
                        <Line
                          key={key}
                          type="linear"
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
              )}
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
                              <Link
                                to={`/dashboard/volunteer/pickups/${row._id}`}
                              >
                                {row.title || 'Donation unavailable'}
                              </Link>
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
