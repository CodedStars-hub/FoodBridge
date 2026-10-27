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
  waitFor,
  within,
  act,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from './auth/AuthContext.js';
import AnalyticsPage from './pages/AnalyticsPage.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import DonationImageManager from './components/DonationImageManager.jsx';
const live = vi.hoisted(() => {
  const handlers = {};
  const socket = {
    on: vi.fn((name, fn) => {
      handlers[name] = fn;
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  return { handlers, socket, io: vi.fn(() => socket) };
});
vi.mock('socket.io-client', () => ({ io: live.io }));
const user = {
  id: 'donor-one',
  name: 'Campus Donor',
  role: 'donor',
  verificationStatus: 'pending',
};
const response = (data, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => data,
});
const analytics = {
  role: 'donor',
  range: { from: '2026-01-01', to: '2026-12-31' },
  generatedAt: '2026-10-25T12:00:00Z',
  summary: {
    totalDonations: 4,
    activeDonations: 2,
    completedDonations: 1,
    completedReceipts: 2,
  },
  quantitiesByUnit: [
    { unit: 'kg', quantity: 3, receipts: 1 },
    { unit: 'servings', quantity: 4, receipts: 1 },
  ],
  monthly: [
    {
      month: '2026-10',
      donations: 4,
      receipts: 2,
      requests: 0,
      pickups: 0,
      users: 0,
    },
  ],
  notes: ['Units are never combined. Receipt confirmation is required.'],
};
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
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  for (const key of Object.keys(live.handlers)) delete live.handlers[key];
  live.io.mockClear();
  live.socket.disconnect.mockClear();
});
afterEach(() => vi.unstubAllGlobals());
function mount(component, actor = user) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={{ user: actor, status: 'authenticated' }}>
        {component}
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}
const note = {
  id: 'notice-one',
  type: 'request_created',
  message: 'Campus bowls: a new food request',
  createdAt: '2026-10-25T12:00:00Z',
  readAt: null,
  requestId: 'request-one',
};
describe('role analytics UX', () => {
  it('renders genuine role totals, separate units and an accessible chart table', async () => {
    fetch.mockResolvedValue(response(analytics));
    mount(<AnalyticsPage />);
    expect(
      await screen.findByText('Food successfully redistributed'),
    ).toBeInTheDocument();
    expect(screen.getByText('kg', { selector: 'th' })).toBeInTheDocument();
    expect(
      screen.getByText('servings', { selector: 'th' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('View chart data as a table'));
    expect(
      screen.getByRole('table', { name: 'Monthly activity counts in UTC' }),
    ).toHaveTextContent('2026-10');
    expect(
      screen.getByRole('table', { name: 'Received food by unit' }),
    ).toHaveTextContent('3');
    expect(screen.queryByText(/7 meals/)).not.toBeInTheDocument();
  });
  it('applies date filters and reports backend validation errors', async () => {
    fetch.mockResolvedValue(response(analytics));
    mount(<AnalyticsPage />);
    await screen.findByText('Food successfully redistributed');
    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: '2026-03-01' },
    });
    fireEvent.change(screen.getByLabelText('To'), {
      target: { value: '2026-03-31' },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Analytics date range' }),
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenLastCalledWith(
        '/api/analytics/donor?from=2026-03-01&to=2026-03-31',
        expect.anything(),
      ),
    );
  });
  it('shows real zero-activity states without sample metrics', async () => {
    fetch.mockResolvedValue(
      response({
        ...analytics,
        summary: {
          totalDonations: 0,
          activeDonations: 0,
          completedDonations: 0,
          completedReceipts: 0,
        },
        quantitiesByUnit: [],
        monthly: [{ month: '2026-10', donations: 0, receipts: 0 }],
      }),
    );
    mount(<AnalyticsPage />);
    expect(
      await screen.findByText(
        'No monthly activity in this range. No sample data is displayed.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No confirmed food receipts in this date range.'),
    ).toBeInTheDocument();
  });
  it('renders role-specific volunteer and admin definitions', async () => {
    fetch.mockResolvedValue(
      response({
        ...analytics,
        role: 'volunteer',
        summary: {
          availableAssignments: 2,
          activeAssignments: 1,
          completedPickups: 0,
        },
        pickupHistory: [],
        quantitiesByUnit: [],
      }),
    );
    mount(<AnalyticsPage />, { ...user, role: 'volunteer' });
    expect(
      await screen.findByText('Available assignments · live'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Food successfully redistributed'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('No pickup activity in this range.'),
    ).toBeInTheDocument();
  });
});
describe('durable notification inbox', () => {
  it('loads the unread badge, opens by keyboard-compatible button and closes on Escape', async () => {
    fetch.mockResolvedValue(
      response({
        items: [note],
        unreadCount: 1,
        pagination: { page: 1, pages: 1, total: 1 },
      }),
    );
    mount(<NotificationBell />);
    const bell = await screen.findByRole('button', {
      name: 'Notifications, 1 unread',
    });
    fireEvent.click(bell);
    expect(
      await screen.findByRole('region', { name: 'Notifications' }),
    ).toBeInTheDocument();
    expect(await screen.findByText(note.message)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByRole('region', { name: 'Notifications' }),
    ).not.toBeInTheDocument();
    expect(bell).toHaveFocus();
  });
  it('refreshes durable state on realtime changes and reconnect', async () => {
    let count = 1;
    fetch.mockImplementation(async () =>
      response({
        items: [note],
        unreadCount: count,
        pagination: { page: 1, pages: 1, total: 1 },
      }),
    );
    mount(<NotificationBell />);
    await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    await waitFor(() =>
      expect(live.handlers['notifications:changed']).toBeTypeOf('function'),
    );
    count = 2;
    act(() => live.handlers['notifications:changed']());
    expect(
      await screen.findByRole('button', { name: 'Notifications, 2 unread' }),
    ).toBeInTheDocument();
    count = 3;
    act(() => live.handlers.connect());
    expect(
      await screen.findByRole('button', { name: 'Notifications, 3 unread' }),
    ).toBeInTheDocument();
    expect(live.io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        withCredentials: true,
        transports: ['websocket'],
      }),
    );
  });
  it('reconciles repeated hints, dropped connections and cross-tab read changes without duplicate items', async () => {
    let read = false;
    fetch.mockImplementation(async () =>
      response({
        items: [{ ...note, readAt: read ? '2026-10-27T10:00:00Z' : null }],
        unreadCount: read ? 0 : 1,
        pagination: { page: 1, pages: 1, total: 1 },
      }),
    );
    mount(<NotificationBell />);
    const bell = await screen.findByRole('button', {
      name: 'Notifications, 1 unread',
    });
    fireEvent.click(bell);
    await screen.findByText(note.message);
    await waitFor(() =>
      expect(live.handlers['notifications:changed']).toBeTypeOf('function'),
    );
    act(() => {
      live.handlers['notifications:changed']();
      live.handlers['notifications:changed']();
      live.handlers['notifications:sync']();
    });
    await waitFor(() =>
      expect(screen.getAllByText(note.message)).toHaveLength(1),
    );
    act(() => live.handlers.disconnect());
    read = true;
    act(() => {
      live.handlers.connect();
      live.handlers['notifications:sync']();
    });
    expect(
      await screen.findByRole('button', { name: 'Notifications, 0 unread' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(note.message)).toHaveLength(1);
    expect(screen.getByText('Read', { exact: true })).toBeInTheDocument();
  });
  it('marks only the chosen inbox notification read and recalculates unread totals', async () => {
    let read = false;
    fetch.mockImplementation(async (url, options) => {
      if (options.method === 'PATCH') {
        read = true;
        return response({
          notification: { ...note, readAt: '2026-10-25T13:00:00Z' },
        });
      }
      return response({
        items: [{ ...note, readAt: read ? '2026-10-25T13:00:00Z' : null }],
        unreadCount: read ? 0 : 1,
        pagination: { page: 1, pages: 1, total: 1 },
      });
    });
    mount(<NotificationsPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mark as read' }),
    );
    await waitFor(() =>
      expect(screen.getByText('0 unread')).toBeInTheDocument(),
    );
    expect(
      fetch.mock.calls.some(
        ([url, o]) =>
          url === '/api/notifications/notice-one/read' && o.method === 'PATCH',
      ),
    ).toBe(true);
  });
  it('disconnects socket subscriptions on unmount and supports inbox errors', async () => {
    fetch.mockResolvedValue(
      response({ error: { message: 'Unavailable' } }, 503),
    );
    const view = mount(<NotificationBell />);
    await waitFor(() => expect(live.socket.connect).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Notifications are unavailable',
    );
    view.unmount();
    expect(live.socket.disconnect).toHaveBeenCalled();
  });
});
describe('donor image controls', () => {
  const config = {
    enabled: true,
    maxBytes: 5 * 1024 * 1024,
    supportedFormats: ['image/jpeg', 'image/png', 'image/webp'],
  };
  it('gracefully displays missing configuration and offers no broken upload control', () => {
    mount(
      <DonationImageManager
        donation={{ _id: 'food' }}
        config={{ ...config, enabled: false }}
        refresh={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Image uploads are not configured/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Upload image' }),
    ).not.toBeInTheDocument();
  });
  it('rejects unsupported file types before making a network call', async () => {
    mount(
      <DonationImageManager
        donation={{ _id: 'food' }}
        config={config}
        refresh={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Choose a food photo'), {
      target: {
        files: [new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' })],
      },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Donation image upload' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'JPEG, PNG or WebP',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('submits multipart with cookie credentials and CSRF header without overriding its boundary', async () => {
    fetch.mockResolvedValue(response({ image: { publicId: 'managed-image' } }));
    const refresh = vi.fn();
    mount(
      <DonationImageManager
        donation={{ _id: 'food' }}
        config={config}
        refresh={refresh}
      />,
    );
    fireEvent.change(screen.getByLabelText('Choose a food photo'), {
      target: {
        files: [
          new File(['image fixture'], 'photo.png', { type: 'image/png' }),
        ],
      },
    });
    fireEvent.submit(
      screen.getByRole('form', { name: 'Donation image upload' }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      '/api/donations/food/image',
      expect.objectContaining({
        credentials: 'include',
        method: 'POST',
        headers: { 'X-CSRF-Protection': 'foodbridge' },
        body: expect.any(FormData),
      }),
    );
  });
  it('requires confirmation before image deletion and retains errors for retry', async () => {
    fetch.mockResolvedValue(
      response({ error: { message: 'Image service unavailable' } }, 502),
    );
    mount(
      <DonationImageManager
        donation={{ _id: 'food', image: { publicId: 'managed' } }}
        config={config}
        refresh={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Confirm',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Image service unavailable',
    );
  });
});

describe('Phase 5 notification presentation and actions', () => {
  it('marks all read through the existing endpoint and shows persisted read states', async () => {
    let read = false;
    fetch.mockImplementation(async (url, options) => {
      if (options.method === 'PATCH') {
        read = true;
        return response({ unreadCount: 0 });
      }
      return response({
        items: [{ ...note, readAt: read ? '2026-10-25T13:00:00Z' : null }],
        unreadCount: read ? 0 : 1,
        pagination: { page: 1, pages: 1, total: 1 },
      });
    });
    mount(<NotificationsPage />);
    await screen.findByText(note.message);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await screen.findByText('All notifications marked as read.');
    expect(
      await screen.findByText('Read', { exact: true }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/notifications/read-all',
      expect.objectContaining({
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Protection': 'foodbridge',
        },
      }),
    );
  });
  it('filters unread notifications and restores the full inbox from the empty state', async () => {
    fetch.mockImplementation(async (url) =>
      response({
        items: url.includes('unread=true')
          ? []
          : [{ ...note, readAt: '2026-10-25T13:00:00Z' }],
        unreadCount: 0,
        pagination: { page: 1, pages: 1, total: 1 },
      }),
    );
    mount(<NotificationsPage />);
    await screen.findByText(note.message);
    fireEvent.click(screen.getByLabelText('Unread only'));
    await screen.findByText('You’re all caught up.');
    expect(fetch).toHaveBeenCalledWith(
      '/api/notifications?page=1&limit=20&unread=true',
      expect.anything(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Show all notifications' }),
    );
    await screen.findByText(note.message);
  });
  it('keeps unread state after a failed mutation and exposes a retryable error', async () => {
    fetch.mockImplementation(async (url, options) =>
      options.method === 'PATCH'
        ? response({ error: { message: 'Unavailable' } }, 503)
        : response({
            items: [note],
            unreadCount: 1,
            pagination: { page: 1, pages: 1, total: 1 },
          }),
    );
    mount(<NotificationsPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mark as read' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to update',
    );
    expect(screen.getByText('Unread', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark as read' })).toBeEnabled();
    expect(
      screen.queryByText('Notification marked as read.'),
    ).not.toBeInTheDocument();
  });
  it('disables duplicate read actions while the server is pending', async () => {
    let finish;
    fetch.mockImplementation(async (url, options) =>
      options.method === 'PATCH'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : response({
            items: [note],
            unreadCount: 1,
            pagination: { page: 1, pages: 1, total: 1 },
          }),
    );
    mount(<NotificationsPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Mark as read' }),
    );
    expect(
      screen.getByRole('button', { name: 'Marking read…' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Mark all read' }),
    ).toBeDisabled();
    expect(
      fetch.mock.calls.filter(([, o]) => o.method === 'PATCH'),
    ).toHaveLength(1);
    await act(async () => finish(response({ notification: note })));
  });
  it.each([
    ['admin', note, '/dashboard/admin/analytics'],
    ['volunteer', note, '/dashboard/volunteer/pickups/request-one'],
    ['volunteer', { ...note, requestId: null }, '/dashboard/volunteer/pickups'],
    [
      'ngo',
      { ...note, requestId: null, donationId: 'donation-one' },
      '/dashboard/ngo/donations/donation-one',
    ],
    ['donor', note, '/dashboard/donor/requests'],
  ])(
    'links %s notifications only to supported role routes',
    async (role, item, path) => {
      fetch.mockResolvedValue(
        response({
          items: [item],
          unreadCount: 1,
          pagination: { page: 1, pages: 1, total: 1 },
        }),
      );
      mount(<NotificationsPage />, { ...user, role });
      expect(
        await screen.findByRole('link', { name: 'View activity' }),
      ).toHaveAttribute('href', path);
    },
  );
  it('offers a deliberate empty inbox without fabricated activity', async () => {
    fetch.mockResolvedValue(
      response({
        items: [],
        unreadCount: 0,
        pagination: { page: 1, pages: 0, total: 0 },
      }),
    );
    mount(<NotificationsPage />);
    expect(
      await screen.findByText('A little quiet, for now.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mark all read' }),
    ).toBeDisabled();
  });
  it('keeps large unread counts accessible and closes on outside interaction', async () => {
    fetch.mockResolvedValue(
      response({
        items: [note],
        unreadCount: 123,
        pagination: { page: 1, pages: 1, total: 1 },
      }),
    );
    mount(<NotificationBell />);
    const bell = await screen.findByRole('button', {
      name: 'Notifications, 123 unread',
    });
    expect(screen.getByText('99+')).toBeInTheDocument();
    fireEvent.click(bell);
    await screen.findByText(note.message);
    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole('region', { name: 'Notifications' }),
    ).not.toBeInTheDocument();
  });
  it('shows mark-all errors in the dropdown and retains durable unread count', async () => {
    fetch.mockImplementation(async (url, options) =>
      options.method === 'PATCH'
        ? response({ error: { message: 'Unavailable' } }, 503)
        : response({
            items: [note],
            unreadCount: 1,
            pagination: { page: 1, pages: 1, total: 1 },
          }),
    );
    mount(<NotificationBell />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    );
    await screen.findByText(note.message);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to mark notifications read',
    );
    expect(
      screen.getByRole('button', { name: 'Notifications, 1 unread' }),
    ).toBeInTheDocument();
  });
});
