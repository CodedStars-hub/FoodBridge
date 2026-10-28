vi.mock('./components/NotificationBell.jsx', () => ({ default: () => null }));
import {
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
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
const user = {
  id: 'donor-1',
  name: 'Campus Kitchen',
  email: 'campus@example.test',
  role: 'donor',
  verificationStatus: 'pending',
  phone: '',
};
const listing = {
  _id: 'food-1',
  donor: { _id: user.id, name: user.name },
  title: 'Harvest bowls',
  description: 'Surplus bowls',
  category: 'prepared-meals',
  quantity: 12,
  remainingQuantity: 12,
  reservedQuantity: 0,
  completedQuantity: 0,
  unit: 'servings',
  preparationTime: '2026-01-01T10:00:00.000Z',
  pickupDeadline: '2099-01-01T12:00:00.000Z',
  storageConditions: 'Refrigerated',
  packagingDetails: 'Sealed',
  handlingDetails: 'Keep cool',
  allergenInformation: 'Sesame',
  pickupLocation: 'Collection desk',
  imageUrl: '',
  status: 'available',
};
const request = {
  _id: 'req-1',
  donation: listing,
  ngo: { name: 'Community Kitchen', organizationName: 'Community Kitchen' },
  unit: 'servings',
  requestedQuantity: 4,
  status: 'pending',
  createdAt: '2026-01-02T10:00:00.000Z',
  updatedAt: '2026-01-02T10:00:00.000Z',
};
const pagination = { page: 1, total: 1, pages: 1 };
const reply = (data, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => data,
});
let extra, descriptor;
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value() {
      this.open = false;
    },
  });
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
beforeEach(() => {
  extra = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const u = new URL(url, 'http://localhost');
      if (extra) {
        const result = extra(u, options);
        if (result) return result;
      }
      if (u.pathname === '/api/auth/me') return reply({ user });
      if (u.pathname === '/api/analytics/donor')
        return reply({
          summary: {
            totalDonations: 7,
            activeDonations: 2,
            completedDonations: 1,
          },
          range: { from: '2026-01-01', to: '2026-12-31' },
          monthly: [
            { month: '2026-01', donations: 3 },
            { month: '2026-02', donations: 4 },
          ],
        });
      if (u.pathname === '/api/donations/mine')
        return reply({ items: [listing], pagination });
      if (u.pathname === '/api/requests')
        return reply({
          items: [request],
          pagination: { ...pagination, total: 3 },
        });
      if (u.pathname === '/api/requests/history')
        return reply({
          items: [
            {
              ...request,
              status: 'completed',
              acceptedAt: '2026-01-02T11:00:00.000Z',
              handedOverAt: '2026-01-02T12:00:00.000Z',
              receivedAt: '2026-01-02T13:00:00.000Z',
            },
          ],
          pagination,
        });
      if (u.pathname === '/api/donations/food-1')
        return reply({
          donation: listing,
          imageUpload: {
            enabled: false,
            maxBytes: 5242880,
            supportedFormats: ['image/png'],
          },
        });
      if (u.pathname === '/api/pickups/mine')
        return reply({
          items: [
            {
              _id: 'req-1',
              requestStatus: 'accepted',
              requestedQuantity: 4,
              unit: 'servings',
              donation: listing,
              status: 'assigned',
              volunteer: { name: 'Assigned Volunteer' },
              origin: { address: 'Collection desk' },
              destination: { address: 'Community delivery desk' },
              locationPrecision: 'exact',
            },
          ],
          pagination,
        });
      if (u.pathname === '/api/users/me')
        return reply({ user: { ...user, ...JSON.parse(options.body) } });
      return reply({ items: [], pagination: { page: 1, pages: 0, total: 0 } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
function mount(path = '/dashboard/donor') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
describe('donor operational workspace', () => {
  it('uses API totals, pending pagination count and recorded monthly activity', async () => {
    mount();
    await screen.findAllByText('Harvest bowls');
    for (const [label, value] of [
      ['Total donations', '7'],
      ['Active listings', '2'],
      ['Pending requests', '3'],
      ['Completed donations', '1'],
    ])
      expect(
        within(screen.getByText(label).closest('article')).getByText(value),
      ).toBeInTheDocument();
    expect(screen.getByText(/2026-01-01.*2026-12-31/)).toBeInTheDocument();
    expect(screen.getByText('Community Kitchen')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Donations created by month/ }),
    ).toBeInTheDocument();
  });
  it('shows onboarding and genuine zero states for a new donor', async () => {
    extra = (u) =>
      u.pathname === '/api/analytics/donor'
        ? reply({
            summary: {
              totalDonations: 0,
              activeDonations: 0,
              completedDonations: 0,
            },
            monthly: [],
          })
        : ['/api/donations/mine', '/api/requests'].includes(u.pathname)
          ? reply({ items: [], pagination: { page: 1, total: 0, pages: 0 } })
          : null;
    mount();
    expect(
      await screen.findByText('Your next chapter starts here.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Create your first donation' }),
    ).toHaveAttribute('href', '/dashboard/donor/donations/new');
  });
  it('does not invent zero analytics when the endpoint fails', async () => {
    extra = (u) =>
      u.pathname === '/api/analytics/donor'
        ? reply({ error: { message: 'Analytics unavailable' } }, 503)
        : null;
    mount();
    await screen.findByRole('button', { name: 'Retry analytics' });
    expect(
      screen.getByText('Total donations').closest('article'),
    ).toHaveTextContent('—');
  });
  it('preserves active navigation and an accessible account menu', async () => {
    mount('/dashboard/donor/donations');
    await screen.findByRole('heading', { name: 'Harvest bowls' });
    expect(
      within(
        screen.getByRole('navigation', { name: 'Dashboard navigation' }),
      ).getByRole('link', { name: 'My donations' }),
    ).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Open profile menu' }));
    expect(
      screen.getByRole('region', { name: 'Account menu' }),
    ).toHaveTextContent(user.email);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByRole('region', { name: 'Account menu' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open profile menu' }),
    ).toHaveFocus();
  });
  it('opens and cancels the mobile navigation dialog', async () => {
    mount('/dashboard/donor/donations');
    await screen.findByRole('heading', { name: 'Harvest bowls' });
    const toggle = screen.getByLabelText('Open workspace navigation');
    fireEvent.click(toggle);
    const dialog = screen.getByRole('dialog', { name: 'Workspace navigation' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(dialog).getByRole('link', { name: 'Incoming requests' }),
    ).toHaveAttribute('href', '/dashboard/donor/requests');
    fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
  it('requires confirmation before cancelling an owned listing and refreshes after success', async () => {
    extra = (u) =>
      u.pathname.endsWith('/cancel')
        ? reply({ donation: { ...listing, status: 'cancelled' } })
        : null;
    mount('/dashboard/donor/donations');
    await screen.findByRole('heading', { name: 'Harvest bowls' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Cancel', exact: true }),
    );
    expect(fetch.mock.calls.some(([u]) => u.endsWith('/cancel'))).toBe(false);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Confirm',
        exact: true,
      }),
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/donations/food-1/cancel',
        expect.objectContaining({ method: 'POST', body: '{}' }),
      ),
    );
  });
  it('uses an honest placeholder if an image fails to load', async () => {
    extra = (u) =>
      u.pathname === '/api/donations/mine'
        ? reply({
            items: [
              {
                ...listing,
                image: { secureUrl: 'https://example.test/unavailable.webp' },
              },
            ],
            pagination,
          })
        : null;
    mount('/dashboard/donor/donations');
    const photo = await screen.findByRole('img', { name: 'Harvest bowls' });
    fireEvent.error(photo);
    expect(screen.getByText('No photo provided')).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Harvest bowls' }),
    ).not.toBeInTheDocument();
  });
  it('reports request mutation success while keeping the existing action payload', async () => {
    extra = (u, o) =>
      u.pathname === '/api/requests/req-1' && o.method === 'PATCH'
        ? reply({ request: { ...request, status: 'accepted' } })
        : null;
    mount('/dashboard/donor/requests');
    await screen.findByRole('button', { name: 'Accept request' });
    fireEvent.click(screen.getByRole('button', { name: 'Accept request' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Confirm',
        exact: true,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Accept request completed',
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/requests/req-1',
      expect.objectContaining({ body: '{"action":"accept"}' }),
    );
  });
  it('shows recorded reservation history and preserves status filtering', async () => {
    mount('/dashboard/donor/history');
    await screen.findByRole('list', { name: 'Reservation timeline' });
    expect(screen.getByText('Receipt confirmed')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Request status'), {
      target: { value: 'completed' },
    });
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('status=completed'),
        expect.anything(),
      ),
    );
  });
  it('shows authorized volunteer details and links to the existing handover workflow', async () => {
    mount('/dashboard/donor/pickups');
    await screen.findByText('Assigned volunteer: Assigned Volunteer');
    expect(
      screen.getByRole('list', { name: 'Pickup progress' }),
    ).toHaveTextContent('Assigned');
    expect(
      screen.getByRole('link', { name: /Open requests for donor handover/ }),
    ).toHaveAttribute('href', '/dashboard/donor/requests');
  });
  it('saves only permitted profile fields from the existing profile anchor', async () => {
    mount('/dashboard/donor#profile');
    await screen.findByLabelText('Full name');
    fireEvent.change(screen.getByLabelText('Phone (optional)'), {
      target: { value: '+15550001111' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(
      await screen.findByText('Your profile has been updated.'),
    ).toBeInTheDocument();
    const call = fetch.mock.calls.find(
      ([url, o]) => url === '/api/users/me' && o.method === 'PATCH',
    );
    expect(JSON.parse(call[1].body)).toEqual({
      name: user.name,
      phone: '+15550001111',
    });
  });
  it('loads existing values for edit without altering the update contract', async () => {
    mount('/dashboard/donor/donations/food-1/edit');
    expect(await screen.findByLabelText('Donation title')).toHaveValue(
      'Harvest bowls',
    );
    expect(screen.getByLabelText('Storage conditions')).toBeRequired();
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Updated declaration' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/donations/food-1',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    const call = fetch.mock.calls.find(
      ([url, o]) => url === '/api/donations/food-1' && o.method === 'PATCH',
    );
    expect(JSON.parse(call[1].body)).toMatchObject({
      description: 'Updated declaration',
      quantity: 12,
      unit: 'servings',
    });
  });
  it('explains pending donor verification without preventing the create form', async () => {
    mount('/dashboard/donor/donations/new');
    expect(
      await screen.findByRole('form', { name: 'Create donation' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Donor accounts can still publish donations/),
    ).toBeInTheDocument();
    expect(screen.getByText('pending verification')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Publish donation' }),
    ).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetch.mock.calls.some(([url]) => url === '/api/donations/new')).toBe(
      false,
    );
  });
  it.each(['ngo', 'volunteer'])(
    'explains role denial and refreshes the stale donor session to the current %s workspace',
    async (role) => {
      let changed = false;
      extra = (u, o) => {
        if (u.pathname === '/api/auth/me' && changed)
          return reply({
            user: { ...user, role, organizationName: 'Isolated community' },
          });
        if (u.pathname === '/api/donations' && o.method === 'POST') {
          changed = true;
          return reply(
            {
              error: {
                message: 'You do not have permission to access this resource',
              },
            },
            403,
          );
        }
        if (
          u.pathname.startsWith('/api/analytics/') ||
          u.pathname === '/api/pickups/available'
        )
          return reply({ summary: {}, monthly: [], items: [], pagination });
        return null;
      };
      mount('/dashboard/donor/donations/new');
      fireEvent.submit(
        await screen.findByRole('form', { name: 'Create donation' }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Only donor accounts can create or edit donations',
      );
      expect(screen.getByRole('alert')).toHaveTextContent('may have changed');
      fireEvent.click(screen.getByRole('button', { name: 'Refresh account' }));
      await waitFor(() =>
        expect(
          screen.queryByRole('form', { name: 'Create donation' }),
        ).not.toBeInTheDocument(),
      );
      expect(
        await within(
          await screen.findByRole('navigation', {
            name: 'Dashboard navigation',
          }),
        ).findByRole('link', {
          name: role === 'ngo' ? 'Explore donations' : 'Available pickups',
          exact: true,
        }),
      ).toHaveAttribute(
        'href',
        `/dashboard/${role}/${role === 'ngo' ? 'explore' : 'pickups/available'}`,
      );
      expect(
        fetch.mock.calls.filter(
          ([url, o]) => url === '/api/donations' && o.method === 'POST',
        ),
      ).toHaveLength(1);
    },
  );
  it('keeps CSRF errors distinct from role and verification guidance', async () => {
    extra = (u, o) =>
      u.pathname === '/api/donations' && o.method === 'POST'
        ? reply(
            {
              error: {
                message: 'Request origin or CSRF protection is invalid',
              },
            },
            403,
          )
        : null;
    mount('/dashboard/donor/donations/new');
    fireEvent.submit(
      await screen.findByRole('form', { name: 'Create donation' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Request origin or CSRF protection is invalid',
    );
    expect(
      screen.getByRole('button', { name: 'Publish donation' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Refresh account' }),
    ).not.toBeInTheDocument();
  });
  it('keeps a saved donation when its optional image upload fails', async () => {
    extra = (u, o) =>
      u.pathname === '/api/donations' && o.method === 'POST'
        ? reply({ donation: listing }, 201)
        : u.pathname.endsWith('/image')
          ? reply(
              { error: { message: 'Image uploads are not configured' } },
              503,
            )
          : null;
    mount('/dashboard/donor/donations/new');
    await screen.findByLabelText('Donation title');
    for (const [label, value] of [
      ['Donation title', 'Harvest bowls'],
      ['Total quantity', '12'],
      ['Description', 'Food description'],
      ['Storage conditions', 'Cool'],
      ['Packaging details', 'Sealed'],
      ['Handling details', 'Keep cool'],
      ['Allergen information', 'Unknown'],
      ['Pickup location', 'Desk'],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.change(screen.getByLabelText('Choose a food photo (optional)'), {
      target: {
        files: [new File(['fixture'], 'food.png', { type: 'image/png' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Publish donation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The donation was saved',
    );
    expect(
      fetch.mock.calls.filter(
        ([u, o]) => u === '/api/donations' && o.method === 'POST',
      ),
    ).toHaveLength(1);
    expect(
      fetch.mock.calls.find(([u]) => u.endsWith('/image'))[1].body,
    ).toBeInstanceOf(FormData);
  });
});
