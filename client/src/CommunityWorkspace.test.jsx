vi.mock('./components/NotificationBell.jsx', () => ({ default: () => null }));
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  within,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
const ngo = {
  id: 'ngo-1',
  role: 'ngo',
  name: 'Mira Patel',
  organizationName: 'Community Table',
  email: 'ngo@example.test',
  verificationStatus: 'verified',
  location: { type: 'Point', coordinates: [77.59, 12.97] },
  address: 'Private NGO desk',
};
const volunteer = {
  ...ngo,
  id: 'vol-1',
  role: 'volunteer',
  organizationName: '',
  name: 'Robin Green',
};
const food = {
  _id: 'food-1',
  donor: { _id: 'donor-1', name: 'Test Kitchen' },
  title: 'Shared vegetable bowls',
  description: 'Surplus food fixture',
  category: 'prepared-meals',
  quantity: 12,
  remainingQuantity: 8,
  reservedQuantity: 4,
  completedQuantity: 0,
  unit: 'servings',
  status: 'available',
  pickupDeadline: '2099-01-01T12:00:00Z',
  preparationTime: '2026-01-01T10:00:00Z',
  pickupLocation: 'Approximate pickup area',
  areaLocation: ngo.location,
  distanceKm: 2,
  match: {
    score: 73.25,
    components: { distance: 75, quantity: 80, pickupTime: 60 },
    weights: { distance: 0.4, quantity: 0.35, pickupTime: 0.25 },
    distanceKm: 2,
    requestedQuantity: 4,
    availableQuantity: 8,
    unit: 'servings',
    minutesRemaining: 90,
    windowMinutes: 240,
  },
};
const request = {
  _id: 'req-1',
  donation: food,
  ngo,
  requestedQuantity: 4,
  unit: 'servings',
  status: 'accepted',
  createdAt: '2026-01-01T10:00:00Z',
  acceptedAt: '2026-01-01T11:00:00Z',
  updatedAt: '2026-01-01T11:00:00Z',
};
const assignment = {
  _id: 'req-1',
  status: 'assigned',
  requestStatus: 'accepted',
  donation: food,
  requestedQuantity: 4,
  unit: 'servings',
  assignedToMe: true,
  canClaim: false,
  locationPrecision: 'exact',
  origin: { address: 'Authorized pickup desk', location: ngo.location },
  destination: { address: 'Authorized delivery desk', location: ngo.location },
  volunteer: { name: volunteer.name },
  events: [{ action: 'claim', status: 'assigned', at: '2026-01-01T11:15:00Z' }],
};
const pagination = { page: 1, total: 1, pages: 1, limit: 12 };
const reply = (data, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => data,
});
let actor, extra;
let showDescriptor, closeDescriptor;
beforeAll(() => {
  showDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
  );
  closeDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'close',
  );
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.open = false;
    },
  });
});
afterAll(() => {
  for (const [name, descriptor] of [
    ['showModal', showDescriptor],
    ['close', closeDescriptor],
  ]) {
    if (descriptor)
      Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else delete HTMLDialogElement.prototype[name];
  }
});
beforeEach(() => {
  actor = ngo;
  extra = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const u = new URL(url, 'http://localhost');
      const override = extra?.(u, options);
      if (override) return override;
      if (u.pathname === '/api/auth/me') return reply({ user: actor });
      if (u.pathname.startsWith('/api/analytics/'))
        return reply({
          summary: {
            totalRequests: 9,
            acceptedRequests: 3,
            completedReceipts: 2,
            availableAssignments: 5,
            activeAssignments: 1,
            completedPickups: 4,
          },
          range: { from: '2026-01-01', to: '2026-12-31' },
          pickupHistory: [
            {
              _id: 'req-1',
              title: food.title,
              quantity: 4,
              unit: 'servings',
              status: 'assigned',
              updatedAt: request.updatedAt,
            },
          ],
        });
      if (u.pathname === '/api/pickups/mine')
        return reply({
          items: [assignment],
          pagination: {
            ...pagination,
            total: u.searchParams.has('status') ? 2 : 1,
          },
        });
      if (u.pathname === '/api/pickups/available')
        return reply({
          items: [
            {
              ...assignment,
              status: 'awaiting_volunteer',
              canClaim: true,
              assignedToMe: false,
              locationPrecision: 'approximate',
              origin: { address: 'Approximate pickup area' },
              destination: { address: 'Approximate delivery area' },
              volunteer: null,
              events: undefined,
            },
          ],
          pagination,
        });
      if (u.pathname === '/api/pickups/req-1') return reply({ assignment });
      if (
        u.pathname === '/api/requests' ||
        u.pathname === '/api/requests/history'
      )
        return reply({ items: [request], pagination });
      if (u.pathname === '/api/donations/food-1')
        return reply({ donation: food });
      if (u.pathname.startsWith('/api/donations'))
        return reply({
          items: [food],
          pagination,
          eligibility: { excludedInsufficientQuantity: 0 },
        });
      if (u.pathname === '/api/users/me')
        return reply({ user: { ...actor, ...JSON.parse(options.body) } });
      return reply({ request });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
function mount(path = '/dashboard/ngo') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
function confirm(label) {
  fireEvent.click(screen.getByRole('button', { name: label, exact: true }));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Confirm',
      exact: true,
    }),
  );
}
function checkMetric(label, value) {
  expect(
    within(
      within(document.querySelector('.donor-metrics'))
        .getByText(label)
        .closest('article'),
    ).getByText(value),
  ).toBeInTheDocument();
}
describe('Phase 4 NGO workspace', () => {
  it('uses actual analytics and all four live delivery status totals', async () => {
    mount();
    await screen.findByText('9');
    checkMetric('Total requests', '9');
    checkMetric('Accepted requests', '3');
    checkMetric('Completed receipts', '2');
    await waitFor(() => checkMetric('Pending deliveries', '8'));
    expect(screen.getByText('Community Table')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Browse donations' }),
    ).toHaveAttribute('href', '/dashboard/ngo/explore');
    for (const status of [
      'awaiting_volunteer',
      'assigned',
      'en_route_to_pickup',
      'picked_up',
    ])
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining(`status=${status}&limit=1`),
        expect.anything(),
      );
  });
  it('shows intentional new-account states and verification guidance', async () => {
    actor = { ...ngo, verificationStatus: 'pending' };
    extra = (u) =>
      u.pathname.startsWith('/api/analytics')
        ? reply({
            summary: {
              totalRequests: 0,
              acceptedRequests: 0,
              completedReceipts: 0,
            },
          })
        : u.pathname !== '/api/auth/me'
          ? reply({
              items: [],
              pagination: { ...pagination, total: 0, pages: 0 },
            })
          : null;
    mount();
    await screen.findByText('Your community’s next connection.');
    expect(
      screen.getByText(/Only verified NGOs can request food/),
    ).toBeInTheDocument();
    checkMetric('Total requests', '0');
    expect(screen.queryByText(food.title)).not.toBeInTheDocument();
    actor = { ...ngo, verificationStatus: 'verified' };
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh verification status' }),
    );
    await screen.findByText(/Your organization is verified/);
  });
  it('keeps missing analytics distinct from zero and supports retry', async () => {
    let failed = true;
    extra = (u) =>
      u.pathname.startsWith('/api/analytics') && failed
        ? reply({ error: { message: 'Unavailable' } }, 503)
        : null;
    mount();
    await screen.findByRole('button', { name: 'Retry analytics' });
    checkMetric('Total requests', '—');
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry analytics' }));
    await screen.findByText('9');
  });
  it('preserves the NGO navigation routes and mobile drawer', async () => {
    mount('/dashboard/ngo/explore');
    await screen.findByRole('heading', { name: 'Explore donations' });
    const nav = screen.getByRole('navigation', {
      name: 'Dashboard navigation',
    });
    for (const [name, route] of [
      ['Recommended donations', 'recommended'],
      ['Nearby donations', 'nearby'],
      ['My requests', 'requests'],
      ['Delivery tracking', 'pickups'],
    ])
      expect(within(nav).getByRole('link', { name })).toHaveAttribute(
        'href',
        '/dashboard/ngo/' + route,
      );
    const toggle = screen.getByLabelText('Open workspace navigation');
    fireEvent.click(toggle);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Close navigation',
      }),
    );
    expect(toggle).toHaveFocus();
  });
  it('uses a photograph fallback and preserves search/category/unit queries', async () => {
    extra = (u) =>
      u.pathname === '/api/donations'
        ? reply({
            items: [
              {
                ...food,
                image: { secureUrl: 'https://example.test/food.webp' },
              },
            ],
            pagination,
          })
        : null;
    mount('/dashboard/ngo/explore');
    fireEvent.error(await screen.findByRole('img', { name: food.title }));
    expect(screen.getByText('No photo provided')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'produce' },
    });
    fireEvent.change(screen.getByLabelText('Unit'), {
      target: { value: 'kg' },
    });
    fireEvent.change(screen.getByLabelText('Search donations'), {
      target: { value: 'rice' },
    });
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/q=rice.*category=produce.*unit=kg/),
        expect.anything(),
      ),
    );
  });
  it('presents backend scores and weights without recomputing ranking', async () => {
    mount('/dashboard/ngo/recommended');
    await screen.findByRole('form', { name: 'Donation discovery' });
    fireEvent.change(screen.getByLabelText('Quantity unit'), {
      target: { value: 'servings' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Donation discovery' }));
    expect(await screen.findByText('73.3 / 100')).toBeInTheDocument();
    expect(screen.getByText('Match 1')).toBeInTheDocument();
    expect(screen.getByText(/Distance suitability · 40%/)).toBeInTheDocument();
    expect(screen.getByText(/not road travel times/)).toBeInTheDocument();
  });
  it('selects a nearby donation using a keyboard-accessible written alternative', async () => {
    extra = (u) =>
      u.pathname === '/api/donations/nearby'
        ? reply({
            items: [food, { ...food, _id: 'food-2', title: 'Second fixture' }],
            pagination,
            eligibility: { excludedInsufficientQuantity: 0 },
          })
        : null;
    mount('/dashboard/ngo/nearby');
    await screen.findByRole('form', { name: 'Donation discovery' });
    fireEvent.submit(screen.getByRole('form', { name: 'Donation discovery' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Preview Second fixture' }),
    );
    const preview = screen.getByRole('region', {
      name: 'Selected donation preview',
    });
    expect(preview).toHaveTextContent('Second fixture');
    expect(within(preview).getByRole('link')).toHaveAttribute(
      'href',
      '/dashboard/ngo/donations/food-2',
    );
    expect(
      screen.queryByRole('region', { name: 'Location map' }),
    ).not.toBeInTheDocument();
  });
  it('does not make receipt available for accepted food and shows real timeline dates', async () => {
    mount('/dashboard/ngo/requests');
    await screen.findByRole('heading', { name: food.title });
    expect(
      screen.queryByRole('button', { name: 'Confirm receipt' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Reservation timeline' }),
    ).toHaveTextContent('Accepted');
    expect(
      screen.getByRole('button', { name: 'Cancel request' }),
    ).toBeInTheDocument();
  });
  it('confirms NGO receipt only after handover using the existing action', async () => {
    extra = (u) =>
      u.pathname === '/api/requests'
        ? reply({
            items: [
              {
                ...request,
                status: 'handed_over',
                handedOverAt: request.updatedAt,
              },
            ],
            pagination,
          })
        : null;
    mount('/dashboard/ngo/requests');
    await screen.findByRole('button', { name: 'Confirm receipt' });
    confirm('Confirm receipt');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Confirm receipt completed',
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/requests/req-1',
      expect.objectContaining({
        method: 'PATCH',
        body: '{"action":"receive"}',
      }),
    );
  });
  it('preserves permitted profile fields and readonly account facts', async () => {
    mount('/dashboard/ngo#profile');
    await screen.findByRole('form', { name: 'Profile' });
    fireEvent.change(screen.getByLabelText('Organization name'), {
      target: { value: 'Updated Table' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Profile' }));
    await screen.findByText('Your profile has been updated.');
    const payload = JSON.parse(
      fetch.mock.calls.find(
        ([u, o]) => u === '/api/users/me' && o.method === 'PATCH',
      )[1].body,
    );
    expect(payload.organizationName).toBe('Updated Table');
    expect(payload).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('verificationStatus');
  });
});
describe('Phase 4 volunteer workspace', () => {
  beforeEach(() => {
    actor = volunteer;
  });
  it('shows real assignment totals and authorized activity', async () => {
    mount('/dashboard/volunteer');
    await screen.findByText('Completed deliveries');
    await waitFor(() => checkMetric('Available pickups', '5'));
    checkMetric('Active assignments', '1');
    checkMetric('Completed deliveries', '4');
    expect(
      screen.getByRole('link', { name: 'Browse pickups' }),
    ).toHaveAttribute('href', '/dashboard/volunteer/pickups/available');
    expect(
      screen.getByText('Authorized pickup desk', { exact: false }),
    ).toBeInTheDocument();
  });
  it('gives an unverified volunteer honest empty guidance', async () => {
    actor = { ...volunteer, verificationStatus: 'pending' };
    extra = (u) =>
      u.pathname.startsWith('/api/analytics')
        ? reply({
            summary: {
              availableAssignments: 0,
              activeAssignments: 0,
              completedPickups: 0,
            },
            pickupHistory: [],
          })
        : u.pathname === '/api/pickups/mine'
          ? reply({ items: [], pagination: { ...pagination, total: 0 } })
          : null;
    mount('/dashboard/volunteer');
    await screen.findByText('Your next good turn starts here.');
    expect(
      screen.getByText(/Only verified volunteers can browse and claim/),
    ).toBeInTheDocument();
    checkMetric('Completed deliveries', '0');
  });
  it('does not expose claim controls when eligibility is denied by the server', async () => {
    actor = { ...volunteer, verificationStatus: 'pending' };
    extra = (u) =>
      u.pathname === '/api/pickups/available'
        ? reply(
            {
              error: {
                message:
                  'Only verified volunteers may browse available pickup assignments',
              },
            },
            403,
          )
        : null;
    mount('/dashboard/volunteer/pickups/available');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only verified volunteers',
    );
    expect(
      screen.queryByRole('button', { name: 'Claim pickup' }),
    ).not.toBeInTheDocument();
  });
  it('reports an atomic claim conflict without claiming success', async () => {
    extra = (u) =>
      u.pathname.endsWith('/claim')
        ? reply({ error: { message: 'Pickup already claimed' } }, 409)
        : null;
    mount('/dashboard/volunteer/pickups/available');
    await screen.findByRole('button', { name: 'Claim pickup' });
    confirm('Claim pickup');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Refresh status',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('another volunteer');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/pickups/req-1/claim',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });
  it('starts an owned assignment and leaves donor/NGO confirmations unavailable', async () => {
    mount('/dashboard/volunteer/pickups');
    await screen.findByRole('button', { name: 'Start pickup' });
    confirm('Start pickup');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Pickup started',
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/pickups/req-1',
      expect.objectContaining({ method: 'PATCH', body: '{"action":"start"}' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Confirm receipt' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Mark handed over' }),
    ).not.toBeInTheDocument();
  });
  it('filters assignment history with backend-supported status values', async () => {
    mount('/dashboard/volunteer/pickups');
    await screen.findByLabelText('Assignment status');
    fireEvent.change(screen.getByLabelText('Assignment status'), {
      target: { value: 'delivered' },
    });
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/pickups/mine?page=1&status=delivered',
        expect.anything(),
      ),
    );
  });
  it('shows actual pickup milestones and keeps arrival distinct from receipt', async () => {
    extra = (u) =>
      u.pathname === '/api/pickups/req-1'
        ? reply({
            assignment: {
              ...assignment,
              status: 'picked_up',
              requestStatus: 'handed_over',
              events: [
                ...assignment.events,
                {
                  action: 'handover',
                  status: 'picked_up',
                  at: request.updatedAt,
                },
              ],
            },
          })
        : null;
    mount('/dashboard/volunteer/pickups/req-1');
    await screen.findByRole('list', { name: 'Pickup history' });
    expect(
      screen
        .getByRole('list', { name: 'Pickup progress' })
        .querySelector('[aria-current="step"]'),
    ).toHaveTextContent('Donor handover');
    expect(
      screen.getByRole('button', { name: 'Report arrival' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Release assignment' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirm receipt' }),
    ).not.toBeInTheDocument();
  });
  it('retains assignment navigation and mobile focus restoration', async () => {
    mount('/dashboard/volunteer/pickups');
    await screen.findByRole('heading', { name: 'My assignments' });
    const nav = screen.getByRole('navigation', {
      name: 'Dashboard navigation',
    });
    expect(
      within(nav).getByRole('link', { name: 'My assignments' }),
    ).toHaveAttribute('aria-current', 'page');
    const toggle = screen.getByLabelText('Open workspace navigation');
    fireEvent.click(toggle);
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true }),
    );
    expect(toggle).toHaveFocus();
  });
});
