import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
const donor = {
  id: 'donor-one',
  name: 'Campus Donor',
  email: 'donor@example.test',
  role: 'donor',
  verificationStatus: 'pending',
  phone: '',
};
const ngo = {
  ...donor,
  id: 'ngo-one',
  name: 'Campus Care',
  role: 'ngo',
  verificationStatus: 'verified',
  organizationName: 'Campus Care',
};
const donation = {
  _id: 'listing-one',
  donor: { _id: donor.id, name: donor.name },
  title: 'Campus rice bowls',
  description: 'Fresh surplus bowls for the community',
  category: 'prepared-meals',
  quantity: 12,
  remainingQuantity: 12,
  reservedQuantity: 0,
  completedQuantity: 0,
  unit: 'servings',
  preparationTime: '2026-01-01T10:00:00.000Z',
  pickupDeadline: '2099-01-01T14:00:00.000Z',
  storageConditions: 'Refrigerated',
  packagingDetails: 'Sealed',
  handlingDetails: 'Keep cool',
  allergenInformation: 'Sesame',
  pickupLocation: 'Cafeteria desk',
  status: 'available',
};
const pagination = { page: 1, pages: 1, limit: 12, total: 1 };
const response = (data, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => data,
});
let dialogDescriptor;
beforeAll(() => {
  dialogDescriptor = Object.getOwnPropertyDescriptor(
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
  if (dialogDescriptor)
    Object.defineProperty(
      HTMLDialogElement.prototype,
      'showModal',
      dialogDescriptor,
    );
  else delete HTMLDialogElement.prototype.showModal;
});
beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());
function mount(path, user, resolver) {
  fetch.mockImplementation(async (url, options) =>
    url.endsWith('/auth/me') ? response({ user }) : resolver(url, options),
  );
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
describe('real-data donation workspace UI', () => {
  it('renders donor listings and sends category filters to the API', async () => {
    mount('/dashboard/donor/donations', donor, () =>
      response({ items: [donation], pagination }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Campus rice bowls' }),
    ).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'bakery' },
    });
    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        expect.stringContaining('category=bakery'),
        expect.anything(),
      ),
    );
    expect(
      screen.getAllByRole('link', { name: 'Create donation', exact: true })[0],
    ).toHaveAttribute('href', '/dashboard/donor/donations/new');
  });
  it('renders an empty explore state and keeps NGO browse accessible', async () => {
    mount(
      '/dashboard/ngo/explore',
      { ...ngo, verificationStatus: 'pending' },
      () =>
        response({
          items: [],
          pagination: { ...pagination, total: 0, pages: 0 },
        }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Nothing here just yet.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Explore donations' }),
    ).toBeInTheDocument();
  });
  it('shows retryable API errors', async () => {
    let failed = true;
    mount('/dashboard/ngo/explore', ngo, () =>
      failed
        ? response({ error: { message: 'Service unavailable' } }, 503)
        : response({ items: [], pagination }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Service unavailable',
    );
    failed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'Nothing here just yet.' }),
    ).toBeInTheDocument();
  });
  it('blocks the request form for unverified NGOs and labels safety declarations', async () => {
    mount(
      '/dashboard/ngo/donations/listing-one',
      { ...ngo, verificationStatus: 'pending' },
      () => response({ donation }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Browse now. Request once verified.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send request' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/pickup deadline does not certify/),
    ).toBeInTheDocument();
  });
  it('submits a verified NGO quantity and shows the pending request confirmation', async () => {
    mount('/dashboard/ngo/donations/listing-one', ngo, (url, options) =>
      options.method === 'POST'
        ? response({ request: { status: 'pending' } }, 201)
        : response({ donation }),
    );
    await screen.findByRole('heading', { name: 'Request food' });
    fireEvent.change(screen.getByLabelText('Requested quantity (servings)'), {
      target: { value: '4' },
    });
    fireEvent.change(screen.getByLabelText('Message to the donor (optional)'), {
      target: { value: 'For our kitchen' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Request food' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Request sent to the donor',
    );
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/donations/listing-one/requests',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          requestedQuantity: 4,
          message: 'For our kitchen',
        }),
      }),
    );
  });
  it('requires confirmation before a donor accepts and refreshes the real request state', async () => {
    let status = 'pending';
    const item = {
      _id: 'request-one',
      donation,
      ngo: { name: ngo.name, organizationName: ngo.organizationName },
      requestedQuantity: 4,
      status,
      createdAt: '2026-01-01T11:00:00Z',
      updatedAt: '2026-01-01T11:00:00Z',
    };
    mount('/dashboard/donor/requests', donor, (url, options) => {
      if (options.method === 'PATCH') {
        status = 'accepted';
        return response({ request: { ...item, status } });
      }
      return response({ items: [{ ...item, status }], pagination });
    });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Accept request' }),
    );
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(/Inventory will be checked again/),
    ).toBeInTheDocument();
    expect(
      fetch.mock.calls.some(([, options]) => options.method === 'PATCH'),
    ).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    expect(
      await screen.findByRole('button', { name: 'Mark handed over' }),
    ).toBeInTheDocument();
    expect(
      fetch.mock.calls.some(
        ([url, options]) =>
          url === '/api/requests/request-one' &&
          options.body === JSON.stringify({ action: 'accept' }),
      ),
    ).toBe(true);
  });
  it('sends history status filters and displays real completion records', async () => {
    mount('/dashboard/ngo/history', ngo, () =>
      response({
        items: [
          {
            _id: 'done',
            donation,
            ngo,
            requestedQuantity: 3,
            status: 'completed',
            createdAt: '2026-01-01T11:00:00Z',
            updatedAt: '2026-01-01T13:00:00Z',
          },
        ],
        pagination,
      }),
    );
    expect(await screen.findByText('3 servings requested')).toBeInTheDocument();
    expect(
      screen.getByText('completed', { selector: '.status-badge' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Confirm receipt' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Request status'), {
      target: { value: 'completed' },
    });
    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/requests/history?page=1&status=completed'),
        expect.anything(),
      ),
    );
  });
  it('publishes a donation using typed quantities and ISO timestamps', async () => {
    mount('/dashboard/donor/donations/new', donor, (url, options) =>
      options.method === 'POST'
        ? response({ donation }, 201)
        : response({ donation }),
    );
    await screen.findByRole('form', { name: 'Create donation' });
    for (const [label, value] of [
      ['Donation title', 'Campus rice bowls'],
      ['Total quantity', '12'],
      ['Description', 'Fresh bowls'],
      ['Storage conditions', 'Refrigerated'],
      ['Packaging details', 'Sealed'],
      ['Handling details', 'Keep cool'],
      ['Allergen information', 'Sesame'],
      ['Pickup location', 'Cafeteria desk'],
    ])
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.submit(screen.getByRole('form', { name: 'Create donation' }));
    expect(
      await screen.findByRole('heading', { name: 'Campus rice bowls' }),
    ).toBeInTheDocument();
    const posted = fetch.mock.calls.find(
      ([, options]) => options.method === 'POST',
    );
    const body = JSON.parse(posted[1].body);
    expect(body.quantity).toBe(12);
    expect(body.preparationTime).toMatch(/Z$/);
    expect(body.pickupDeadline).toMatch(/Z$/);
    expect(body).not.toHaveProperty('donor');
  });
});
