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
import { locationInput } from './utils/location.js';
const user = {
  id: 'ngo-one',
  name: 'Community NGO',
  email: 'ngo@example.test',
  role: 'ngo',
  verificationStatus: 'verified',
  location: { type: 'Point', coordinates: [77.59, 12.97] },
  address: 'My private NGO destination',
};
const food = {
  _id: 'food-one',
  title: 'Fresh rice bowls',
  description: 'Surplus bowls',
  category: 'prepared-meals',
  remainingQuantity: 8,
  reservedQuantity: 0,
  completedQuantity: 0,
  quantity: 8,
  unit: 'servings',
  pickupDeadline: '2099-01-01T12:00:00Z',
  status: 'available',
  pickupLocation: 'Exact pickup address shared after acceptance',
  areaLocation: { type: 'Point', coordinates: [77.6, 12.98] },
  distanceKm: 2,
  match: {
    score: 62,
    components: { distance: 80, quantity: 50, pickupTime: 50 },
    weights: { distance: 0.4, quantity: 0.35, pickupTime: 0.25 },
    requestedQuantity: 4,
    availableQuantity: 8,
    unit: 'servings',
    fulfillment: 'complete',
    distanceKm: 2,
    minutesRemaining: 120,
    windowMinutes: 240,
  },
};
const pagination = { page: 1, pages: 1, total: 1, limit: 12 };
const assignment = {
  _id: 'request-one',
  status: 'awaiting_volunteer',
  requestStatus: 'accepted',
  requestedQuantity: 4,
  unit: 'servings',
  donation: {
    _id: 'food-one',
    title: 'Fresh rice bowls',
    pickupDeadline: '2099-01-01T12:00:00Z',
  },
  origin: { address: 'Approximate pickup area', location: food.areaLocation },
  destination: {
    address: 'Approximate delivery area',
    location: food.areaLocation,
  },
  locationPrecision: 'approximate',
  canClaim: true,
  assignedToMe: false,
  previouslyAssignedToMe: false,
  volunteer: null,
};
const reply = (data, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => data,
});
let descriptor;
beforeAll(() => {
  descriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
  );
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value() {
      this.open = true;
    },
  });
});
afterAll(() => {
  if (descriptor)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', descriptor);
  else delete HTMLDialogElement.prototype.showModal;
});
beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());
function mount(
  path,
  actor = user,
  resolver = () => reply({ items: [], pagination }),
) {
  fetch.mockImplementation(async (url, options) =>
    url.endsWith('/auth/me') ? reply({ user: actor }) : resolver(url, options),
  );
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
describe('location and matching interface', () => {
  it('converts longitude first and handles zero coordinates and clearing', () => {
    expect(
      locationInput({ locationLongitude: '0', locationLatitude: '0' }),
    ).toEqual({ location: { type: 'Point', coordinates: [0, 0] } });
    expect(
      locationInput(
        { locationLongitude: '', locationLatitude: '' },
        { location: user.location },
      ),
    ).toEqual({ location: null });
    expect(() =>
      locationInput({ locationLongitude: '77', locationLatitude: '' }),
    ).toThrow('both');
  });
  it('shows explained recommendations and explicitly identifies insufficient listings', async () => {
    mount('/dashboard/ngo/recommended', user, () =>
      reply({
        items: [food],
        pagination,
        eligibility: { excludedInsufficientQuantity: 2 },
      }),
    );
    await screen.findByRole('form', { name: 'Donation discovery' });
    fireEvent.change(screen.getByLabelText('Requested quantity'), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText('Quantity unit'), {
      target: { value: 'servings' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Donation discovery' }));
    expect(await screen.findByText('62.0 / 100')).toBeInTheDocument();
    expect(screen.getByText(/Distance suitability · 40%/)).toBeInTheDocument();
    expect(screen.getByText(/2 nearby listing/)).toHaveTextContent(
      'Partial inventory is excluded',
    );
    expect(
      screen.getByRole('button', { name: 'Show optional map' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Location map' }),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining(
        '/api/donations/recommendations?quantity=4&unit=servings',
      ),
      expect.anything(),
    );
  });
  it('handles missing saved coordinates without fabricating a location', async () => {
    mount('/dashboard/ngo/nearby', { ...user, location: undefined });
    await screen.findByRole('form', { name: 'Donation discovery' });
    fireEvent.submit(screen.getByRole('form', { name: 'Donation discovery' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Add your profile location',
    );
    expect(fetch.mock.calls).toHaveLength(1);
  });
  it('provides useful no-match and retry states', async () => {
    let failed = true;
    mount('/dashboard/ngo/nearby', user, () =>
      failed
        ? reply({ error: { message: 'Discovery unavailable' } }, 503)
        : reply({
            items: [],
            pagination,
            eligibility: { excludedInsufficientQuantity: 0 },
          }),
    );
    await screen.findByRole('form', { name: 'Donation discovery' });
    fireEvent.submit(screen.getByRole('form', { name: 'Donation discovery' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Discovery unavailable',
    );
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', {
        name: 'No eligible donations nearby.',
      }),
    ).toBeInTheDocument();
  });
  it('saves a private profile location using the existing auth context', async () => {
    mount('/dashboard/ngo', user, () =>
      reply({
        user: { ...user, location: { type: 'Point', coordinates: [78, 13] } },
      }),
    );
    await screen.findByLabelText('Longitude');
    fireEvent.change(screen.getByLabelText('Longitude'), {
      target: { value: '78' },
    });
    fireEvent.change(screen.getByLabelText('Latitude'), {
      target: { value: '13' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Profile' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your profile has been updated',
    );
    const call = fetch.mock.calls.find(([, o]) => o.method === 'PATCH');
    expect(JSON.parse(call[1].body)).toMatchObject({
      location: { type: 'Point', coordinates: [78, 13] },
      address: 'My private NGO destination',
    });
  });
});
describe('volunteer logistics and participant tracking', () => {
  const volunteer = {
    ...user,
    id: 'vol-one',
    name: 'Community Volunteer',
    role: 'volunteer',
  };
  it('requires confirmation before claiming and loads my assigned status', async () => {
    let claimed = false;
    mount(
      '/dashboard/volunteer/pickups/available',
      volunteer,
      (url, options) => {
        if (options.method === 'POST') {
          claimed = true;
          return reply({ assignment: { ...assignment, status: 'assigned' } });
        }
        return reply({ items: claimed ? [] : [assignment], pagination });
      },
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Claim pickup' }),
    );
    expect(fetch.mock.calls.some(([, o]) => o.method === 'POST')).toBe(false);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Confirm',
      }),
    );
    await waitFor(() =>
      expect(
        fetch.mock.calls.some(
          ([url, o]) =>
            url === '/api/pickups/request-one/claim' && o.method === 'POST',
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByRole('heading', { name: 'Nothing here just yet.' }),
    ).toBeInTheDocument();
  });
  it('shows donor-confirmed custody and arrival reporting but no volunteer receipt control', async () => {
    mount('/dashboard/volunteer/pickups/request-one', volunteer, () =>
      reply({
        assignment: {
          ...assignment,
          status: 'picked_up',
          requestStatus: 'handed_over',
          canClaim: false,
          assignedToMe: true,
          locationPrecision: 'exact',
          origin: {
            ...assignment.origin,
            address: 'Authorized collection desk',
          },
          destination: {
            ...assignment.destination,
            address: 'Authorized delivery desk',
          },
          volunteer: { id: volunteer.id, name: volunteer.name },
          events: [],
        },
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Report arrival' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Authorized delivery desk')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirm receipt' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Release assignment' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Pickup or delivery issue'), {
      target: { value: 'Destination unavailable' },
    });
    expect(
      screen.getByRole('button', { name: 'Report failed pickup / issue' }),
    ).toBeEnabled();
  });
  it('shows private assignment errors without inventing assignment details', async () => {
    mount('/dashboard/volunteer/pickups/request-one', volunteer, () =>
      reply(
        { error: { message: 'This pickup is private to its participants' } },
        403,
      ),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('private');
    expect(
      screen.queryByText('Authorized delivery desk'),
    ).not.toBeInTheDocument();
  });
  it('lets the NGO arrange pickup using an existing accepted request', async () => {
    let arranged = false;
    const req = {
      _id: 'request-one',
      status: 'accepted',
      donation: food,
      requestedQuantity: 4,
      unit: 'servings',
      createdAt: '2026-01-01T10:00:00Z',
      updatedAt: '2026-01-01T10:00:00Z',
    };
    mount('/dashboard/ngo/requests', user, (url, options) => {
      if (options.method === 'POST') {
        arranged = true;
        return reply({ assignment }, 201);
      }
      return reply({
        items: [
          {
            ...req,
            ...(arranged ? { pickup: { status: 'awaiting_volunteer' } } : {}),
          },
        ],
        pagination,
      });
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Arrange volunteer pickup' }),
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Confirm',
      }),
    );
    expect(
      await screen.findByRole('link', {
        name: /View pickup and delivery details/,
      }),
    ).toHaveAttribute('href', '/dashboard/ngo/pickups/request-one');
    expect(
      fetch.mock.calls.some(
        ([url, o]) =>
          url === '/api/requests/request-one/pickup' && o.method === 'POST',
      ),
    ).toBe(true);
  });
  it('keeps NGO receipt confirmation in the original role-protected request workflow', async () => {
    let received = false;
    mount('/dashboard/ngo/requests', user, (url, options) => {
      if (options.method === 'PATCH') {
        received = true;
        return reply({});
      }
      return reply({
        items: [
          {
            _id: 'request-one',
            donation: food,
            status: received ? 'completed' : 'handed_over',
            pickup: { status: received ? 'delivered' : 'picked_up' },
            requestedQuantity: 4,
            unit: 'servings',
            createdAt: '2026-01-01T10:00:00Z',
            updatedAt: '2026-01-01T10:00:00Z',
          },
        ],
        pagination,
      });
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm receipt' }),
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Confirm',
      }),
    );
    expect(
      await screen.findByText('delivered', { selector: '.status-badge' }),
    ).toBeInTheDocument();
    expect(
      fetch.mock.calls.some(
        ([url, o]) =>
          url === '/api/requests/request-one' &&
          o.body === JSON.stringify({ action: 'receive' }),
      ),
    ).toBe(true);
  });
});
