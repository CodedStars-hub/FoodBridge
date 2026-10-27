vi.mock('./components/NotificationBell.jsx', () => ({ default: () => null }));
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from './auth/AuthContext.js';
import AdminOverview from './pages/AdminOverview.jsx';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import App from './App.jsx';
const actor = {
  id: 'admin-1',
  name: 'Alex Rivera',
  email: 'admin@example.test',
  role: 'admin',
  verificationStatus: 'verified',
};
const data = {
  role: 'admin',
  range: { from: '2026-01-01', to: '2026-12-31' },
  generatedAt: '2026-10-27T10:00:00Z',
  summary: {
    totalUsers: 12,
    totalDonations: 8,
    activeDonations: 3,
    completedDonations: 2,
    completedReceipts: 4,
    completionRate: 25,
  },
  usersByRole: [
    { role: 'donor', count: 5 },
    { role: 'ngo', count: 4 },
    { role: 'volunteer', count: 2 },
    { role: 'admin', count: 1 },
  ],
  monthly: [
    { month: '2026-09', users: 7, donations: 3, receipts: 1 },
    { month: '2026-10', users: 5, donations: 5, receipts: 3 },
  ],
  quantitiesByUnit: [
    { unit: 'kg', quantity: 5, receipts: 1 },
    { unit: 'servings', quantity: 8, receipts: 3 },
  ],
  notes: [
    'Quantities are never combined across units. Food is counted only after NGO receipt.',
  ],
};
const reply = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
function mount(component, role = 'admin') {
  return render(
    <MemoryRouter>
      <AuthContext.Provider
        value={{ user: { ...actor, role }, status: 'authenticated' }}
      >
        {component}
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(data)));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
describe('Phase 5 admin overview', () => {
  it('displays real scoped metrics, role counts and monthly platform activity', async () => {
    mount(<AdminOverview />);
    await screen.findByText('Registered users');
    for (const [label, value] of [
      ['Registered users', '12'],
      ['Active food listings', '3'],
      ['Completed donations', '2'],
      ['Confirmed receipts', '4'],
    ])
      expect(
        within(screen.getByText(label).closest('article')).getByText(value),
      ).toBeInTheDocument();
    expect(
      screen.getByRole('table', {
        name: 'Recent active months · platform counts',
      }),
    ).toHaveTextContent('2026-10');
    expect(screen.getByText(/2026-01-01.*2026-12-31/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/api/analytics/admin',
      expect.anything(),
    );
  });
  it('does not present fake verification counts, directory data or privileged actions', async () => {
    mount(<AdminOverview />);
    await screen.findByText('Registered users');
    expect(
      screen.getByText(/A pending-verification count, review queue/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Individual account search/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /approve|reject|delete user/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Upcoming feature')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Platform analytics' }),
    ).toHaveAttribute('href', '/dashboard/admin/analytics');
  });
  it('renders genuine zero activity without an invented recent feed', async () => {
    fetch.mockResolvedValue(
      reply({
        ...data,
        summary: {
          totalUsers: 0,
          activeDonations: 0,
          completedDonations: 0,
          completedReceipts: 0,
        },
        monthly: [],
        usersByRole: data.usersByRole.map((row) => ({ ...row, count: 0 })),
      }),
    );
    mount(<AdminOverview />);
    await screen.findByText(
      'No recorded platform activity in this date range.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(
      within(
        screen
          .getByText('Registered users', {
            selector: '.analytics-metric-label',
          })
          .closest('article'),
      ).getByText('0'),
    ).toBeInTheDocument();
  });
  it('keeps failed analytics unavailable and supports recovery', async () => {
    fetch.mockResolvedValueOnce(
      reply({ error: { message: 'Analytics unavailable' } }, 503),
    );
    mount(<AdminOverview />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Analytics unavailable',
    );
    expect(screen.queryByText('Registered users')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Registered users');
  });
  it('keeps supported admin navigation and safe profile editing available', async () => {
    fetch.mockImplementation(async (url) =>
      reply(url.endsWith('/auth/me') ? { user: actor } : data),
    );
    render(
      <MemoryRouter initialEntries={['/dashboard/admin']}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByText('Registered users');
    const nav = screen.getByRole('navigation', {
      name: 'Dashboard navigation',
    });
    for (const name of ['Overview', 'Analytics', 'Notifications', 'My profile'])
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    expect(
      within(nav).queryByRole('link', { name: /verification|manage users/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
  });
});
describe('Phase 5 role analytics', () => {
  it.each(['donor', 'ngo', 'volunteer', 'admin'])(
    'uses the existing %s endpoint and applied date range',
    async (role) => {
      const summary = {
        ...data.summary,
        totalRequests: 6,
        acceptedRequests: 2,
        completedPickups: 3,
        activeAssignments: 1,
        availableAssignments: 2,
      };
      fetch.mockResolvedValue(
        reply({
          ...data,
          role,
          summary,
          ...(role === 'volunteer' ? { pickupHistory: [] } : {}),
        }),
      );
      mount(<AnalyticsPage />, role);
      await screen.findByText('Applied date range');
      expect(fetch.mock.calls[0][0]).toContain(`/api/analytics/${role}?from=`);
      expect(
        screen.getByText('2026-01-01 – 2026-12-31 · UTC'),
      ).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('From'), {
        target: { value: '2026-04-01' },
      });
      fireEvent.change(screen.getByLabelText('To'), {
        target: { value: '2026-04-30' },
      });
      fireEvent.submit(
        screen.getByRole('form', { name: 'Analytics date range' }),
      );
      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          `/api/analytics/${role}?from=2026-04-01&to=2026-04-30`,
          expect.anything(),
        ),
      );
    },
  );
  it('rejects reversed dates with keyboard focus and no invalid request', async () => {
    mount(<AnalyticsPage />);
    await screen.findByText('Applied date range');
    const before = fetch.mock.calls.length;
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2027-01-01' },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2026-01-01' },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Analytics date range' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Start date');
    expect(screen.getByLabelText('From')).toHaveFocus();
    expect(fetch).toHaveBeenCalledTimes(before);
  });
  it('uses returned completion rate and keeps incompatible units separate', async () => {
    fetch.mockResolvedValue(
      reply({ ...data, summary: { ...data.summary, completionRate: 31.25 } }),
    );
    mount(<AnalyticsPage />);
    expect(await screen.findByText('31.3%')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Received food by unit' });
    expect(
      within(table).getByRole('row', { name: 'kg 5 1' }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('row', { name: 'servings 8 3' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('13 meals')).not.toBeInTheDocument();
  });
  it('shows unavailable metrics as unavailable rather than zero', async () => {
    fetch.mockResolvedValue(reply({ ...data, summary: { totalUsers: 0 } }));
    mount(<AnalyticsPage />);
    await screen.findByText('Applied date range');
    expect(
      within(
        screen
          .getByText('Registered users', {
            selector: '.analytics-metric-label',
          })
          .closest('article'),
      ).getByText('0'),
    ).toBeInTheDocument();
    expect(
      within(
        screen.getByText('Completed donations').closest('article'),
      ).getByText('—'),
    ).toBeInTheDocument();
  });
  it('offers exact chart values and a distinct zero-data message', async () => {
    fetch.mockResolvedValue(
      reply({
        ...data,
        monthly: [{ month: '2026-10', donations: 0, receipts: 0, users: 0 }],
        quantitiesByUnit: [],
      }),
    );
    mount(<AnalyticsPage />);
    await screen.findByText(
      'No monthly activity in this range. No sample data is displayed.',
    );
    fireEvent.click(screen.getByText('View chart data as a table'));
    expect(
      screen.getByRole('table', { name: 'Monthly activity counts in UTC' }),
    ).toHaveTextContent('2026-10');
    expect(
      screen.queryByRole('group', { name: /Monthly activity chart/ }),
    ).not.toBeInTheDocument();
  });
  it('shows backend range validation errors and allows retry', async () => {
    fetch.mockResolvedValueOnce(
      reply({ error: { message: 'Date range cannot exceed two years' } }, 400),
    );
    mount(<AnalyticsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('two years');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Applied date range');
  });
});
