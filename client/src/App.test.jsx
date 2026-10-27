vi.mock('./components/NotificationBell.jsx', () => ({
  default: () => null,
}));
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';
const donor = {
  id: 'one',
  name: 'Taylor Green',
  email: 'taylor@example.test',
  role: 'donor',
  verificationStatus: 'pending',
  phone: '',
  organizationName: '',
};
function reply(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
function renderPage(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
beforeEach(() =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url) => {
      if (url.includes('/analytics/donor'))
        return reply({
          summary: {
            totalDonations: 0,
            activeDonations: 0,
            completedDonations: 0,
          },
          monthly: [],
          range: { from: '2026-01-01', to: '2026-12-31' },
        });
      if (url.includes('/donations/mine') || url.includes('/requests?'))
        return reply({ items: [], pagination: { total: 0, pages: 0 } });
      return reply({ error: { message: 'Authentication required' } }, 401);
    }),
  ),
);
afterEach(() => vi.unstubAllGlobals());
describe('FoodBridge application shell', () => {
  it('preserves the landing page and donor/NGO calls to action', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Good fooddeserves asecond story.',
    );
    expect(
      screen.getAllByRole('link', { name: 'Share surplus food' })[0],
    ).toHaveAttribute('href', '/register?role=donor');
    expect(
      screen.getByRole('link', { name: 'Find food for your community' }),
    ).toHaveAttribute('href', '/register?role=ngo');
    expect(
      screen.getByRole('heading', {
        name: /From surplus/,
      }),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });
  it('carries donor intent through navigation', async () => {
    renderPage();
    fireEvent.click(
      screen.getAllByRole('link', { name: 'Share surplus food' })[0],
    );
    expect(
      await screen.findByRole('heading', { name: 'Create your account' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Food donor' })).toBeChecked();
    expect(
      screen.queryByRole('radio', { name: /admin/i }),
    ).not.toBeInTheDocument();
  });
  it('toggles accessible mobile navigation', async () => {
    renderPage();
    const button = screen.getByLabelText('Open navigation');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });
  it('links public sections to real homepage landmarks', async () => {
    renderPage();
    const navigation = screen.getByRole('navigation', {
      name: 'Main navigation',
    });
    for (const anchor of navigation.querySelectorAll('a[href^="/#"]')) {
      expect(document.getElementById(anchor.hash.slice(1))).not.toBeNull();
    }
    expect(screen.getByRole('link', { name: 'Lend a hand' })).toHaveAttribute(
      'href',
      '/register?role=volunteer',
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });
  it('closes the public menu on Escape and restores the toggle focus', async () => {
    renderPage();
    const button = screen.getByLabelText('Open navigation');
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });
  it('carries NGO intent into the existing registration form and keeps its design boundary', async () => {
    renderPage();
    fireEvent.click(
      screen.getByRole('link', { name: 'Find food for your community' }),
    );
    await screen.findByRole('form', { name: 'Registration' });
    expect(
      screen.getByRole('radio', { name: 'NGO', exact: true }),
    ).toBeChecked();
    expect(screen.getByLabelText('Organization name')).toBeRequired();
    expect(document.querySelector('.public-site')).toBeNull();
    expect(document.querySelector('.auth-form-panel')).toBeInTheDocument();
  });
  it('preserves the authenticated public navigation destination', async () => {
    fetch.mockResolvedValueOnce(
      reply({ user: { ...donor, role: 'volunteer' } }),
    );
    renderPage();
    expect(
      await screen.findByRole('link', { name: 'My dashboard' }),
    ).toHaveAttribute('href', '/dashboard/volunteer');
  });
  it('provides a recovery route', async () => {
    renderPage('/unknown');
    expect(
      screen.getByRole('heading', { name: 'A little off the path.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
      'href',
      '/',
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });
});
describe('sessions and role-based navigation', () => {
  it('shows session loading and sends credentials during restoration', async () => {
    let resolve;
    fetch.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    renderPage('/dashboard');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Restoring your session',
    );
    resolve(reply({ user: donor }));
    expect(
      await screen.findByRole('heading', {
        name: 'A little surplus. A lot of possibility.',
      }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
  });
  it.each([
    '/dashboard',
    '/dashboard/admin',
    '/dashboard/donor',
    '/dashboard/ngo',
    '/dashboard/volunteer',
  ])('redirects anonymous visitors from %s to login', async (path) => {
    renderPage(path);
    expect(
      await screen.findByRole('heading', { name: 'Log in to FoodBridge' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('navigation', { name: 'Dashboard navigation' }),
    ).not.toBeInTheDocument();
  });
  it.each([
    ['donor', 'A little surplus. A lot of possibility.'],
    ['ngo', 'Bring more possibility to your community.'],
    ['volunteer', 'Small actions move communities forward.'],
    ['admin', 'A stronger foundation for shared good.'],
  ])('restores the %s dashboard', async (role, title) => {
    fetch.mockResolvedValue(
      reply({
        user: {
          ...donor,
          role,
          organizationName: role === 'ngo' ? 'Campus Care' : '',
        },
      }),
    );
    renderPage('/dashboard');
    expect(
      await screen.findByRole('heading', { name: title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Dashboard navigation' }),
    ).toBeInTheDocument();
    if (role === 'donor')
      expect(screen.getByText('Active listings')).toBeInTheDocument();
    else
      expect(
        screen.getAllByText(
          role === 'admin' ? 'Upcoming feature' : 'Ready to use',
        ),
      ).toHaveLength(role === 'volunteer' ? 2 : 3);
  });
  it('redirects the wrong frontend role to its own dashboard', async () => {
    fetch.mockResolvedValue(reply({ user: donor }));
    renderPage('/dashboard/admin');
    expect(
      await screen.findByRole('heading', {
        name: 'A little surplus. A lot of possibility.',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Account verification')).not.toBeInTheDocument();
  });
  it('keeps network failures distinct from logged-out sessions and supports retry', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderPage('/dashboard');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'couldn’t restore',
    );
    fetch.mockResolvedValueOnce(reply({ user: donor }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', {
        name: 'A little surplus. A lot of possibility.',
      }),
    ).toBeInTheDocument();
  });
  it('logs in and redirects by role without browser token storage', async () => {
    renderPage('/login');
    await screen.findByRole('heading', { name: 'Log in to FoodBridge' });
    fetch.mockResolvedValueOnce(reply({ user: donor }));
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: donor.email },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'strong password here' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'Login' }));
    expect(
      await screen.findByRole('heading', {
        name: 'A little surplus. A lot of possibility.',
      }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Protection': 'foodbridge',
        },
      }),
    );
    expect(localStorage.length).toBe(0);
  });
  it('registers NGOs with organization details', async () => {
    renderPage('/register?role=ngo');
    await screen.findByRole('heading', { name: 'Create your account' });
    expect(screen.getByRole('radio', { name: 'NGO' })).toBeChecked();
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: donor.name },
    });
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: donor.email },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'strong password here' },
    });
    fireEvent.change(screen.getByLabelText('Organization name'), {
      target: { value: 'Campus Care' },
    });
    fetch.mockResolvedValueOnce(
      reply(
        { user: { ...donor, role: 'ngo', organizationName: 'Campus Care' } },
        201,
      ),
    );
    fireEvent.submit(screen.getByRole('form', { name: 'Registration' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Bring more possibility to your community.',
      }),
    ).toBeInTheDocument();
    const options = fetch.mock.calls.at(-1)[1];
    expect(JSON.parse(options.body)).toMatchObject({
      role: 'ngo',
      organizationName: 'Campus Care',
    });
  });
  it('displays validation errors accessibly', async () => {
    renderPage('/register');
    await screen.findByRole('heading', { name: 'Create your account' });
    fetch.mockResolvedValueOnce(
      reply(
        {
          error: {
            message: 'Please check the submitted fields',
            fields: { email: 'Enter a valid email' },
          },
        },
        400,
      ),
    );
    fireEvent.submit(screen.getByRole('form', { name: 'Registration' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please check');
    expect(screen.getByLabelText('Email address')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
  });
  it('updates a safe profile and shows save feedback', async () => {
    fetch.mockResolvedValueOnce(reply({ user: donor }));
    renderPage('/dashboard');
    await screen.findByLabelText('Full name');
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Taylor Updated' },
    });
    fetch.mockResolvedValueOnce(
      reply({ user: { ...donor, name: 'Taylor Updated' } }),
    );
    fireEvent.submit(screen.getByRole('form', { name: 'Profile' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your profile has been updated',
    );
    expect(JSON.parse(fetch.mock.calls.at(-1)[1].body)).toEqual({
      name: 'Taylor Updated',
      phone: '',
    });
  });
  it('logs out and returns to login', async () => {
    fetch.mockResolvedValueOnce(reply({ user: donor }));
    renderPage('/dashboard');
    await screen.findByRole('button', { name: 'Log out' });
    fetch.mockResolvedValueOnce(reply(null, 204));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(
      await screen.findByRole('heading', { name: 'Log in to FoodBridge' }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
  it('shows logout failures from a dashboard subpage without losing the session', async () => {
    fetch.mockResolvedValueOnce(reply({ user: donor }));
    fetch.mockResolvedValueOnce(
      reply({ items: [], unreadCount: 0, pagination: { page: 1, pages: 0 } }),
    );
    renderPage('/dashboard/donor/notifications');
    await screen.findByRole('heading', { name: 'Notification center' });
    fetch.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to log out',
    );
    expect(
      screen.getByRole('heading', { name: 'Notification center' }),
    ).toBeInTheDocument();
  });
  it('retains the session and offers feedback if logout fails', async () => {
    fetch.mockResolvedValueOnce(reply({ user: donor }));
    renderPage('/dashboard');
    await screen.findByRole('button', { name: 'Log out' });
    fetch.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to log out',
    );
    expect(
      screen.getByRole('navigation', { name: 'Dashboard navigation' }),
    ).toBeInTheDocument();
  });
});

describe('editorial authentication experience', () => {
  it.each(['donor', 'ngo', 'volunteer'])(
    'preserves %s URL preselection and public roles only',
    async (role) => {
      renderPage(`/register?role=${role}`);
      await screen.findByRole('form', { name: 'Registration' });
      const label = { donor: 'Food donor', ngo: 'NGO', volunteer: 'Volunteer' }[
        role
      ];
      expect(
        screen.getByRole('radio', { name: label, exact: true }),
      ).toBeChecked();
      expect(screen.getAllByRole('radio')).toHaveLength(3);
      if (role === 'ngo')
        expect(screen.getByLabelText('Organization name')).toBeRequired();
      else
        expect(
          screen.queryByLabelText('Organization name'),
        ).not.toBeInTheDocument();
    },
  );
  it.each(['/login', '/register'])(
    'toggles password visibility without changing its value or submitting %s',
    async (path) => {
      renderPage(path);
      const password = await screen.findByLabelText('Password');
      fireEvent.change(password, {
        target: { value: 'a private test password' },
      });
      expect(password).toHaveAttribute('type', 'password');
      fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
      expect(password).toHaveAttribute('type', 'text');
      expect(password).toHaveValue('a private test password');
      expect(
        screen.getByRole('button', { name: 'Hide password' }),
      ).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(password).toHaveAttribute('type', 'password');
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('switches role-specific fields and sends exactly the existing volunteer signup fields', async () => {
    renderPage('/register?role=ngo');
    await screen.findByLabelText('Organization name');
    fireEvent.click(
      screen.getByRole('radio', { name: 'Volunteer', exact: true }),
    );
    expect(
      screen.queryByLabelText('Organization name'),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Community Volunteer' },
    });
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'volunteer@example.test' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'strong test password' },
    });
    fetch.mockResolvedValueOnce(
      reply({ error: { message: 'Please retry' } }, 503),
    );
    fireEvent.submit(screen.getByRole('form', { name: 'Registration' }));
    await screen.findByRole('alert');
    expect(JSON.parse(fetch.mock.calls.at(-1)[1].body)).toEqual({
      name: 'Community Volunteer',
      email: 'volunteer@example.test',
      password: 'strong test password',
      phone: '',
      role: 'volunteer',
    });
    expect(fetch.mock.calls.at(-1)[1].headers).toEqual({
      'Content-Type': 'application/json',
      'X-CSRF-Protection': 'foodbridge',
    });
  });
  it('retains native registration validation constraints and focuses server field errors', async () => {
    renderPage('/register?role=ngo');
    const password = await screen.findByLabelText('Password');
    expect(password).toHaveAttribute('minlength', '12');
    expect(password).toHaveAttribute('maxlength', '72');
    expect(screen.getByLabelText('Email address')).toHaveAttribute(
      'type',
      'email',
    );
    expect(screen.getByLabelText('Full name')).toBeRequired();
    fetch.mockResolvedValueOnce(
      reply(
        {
          error: {
            message: 'Please check the submitted fields',
            fields: { email: 'Enter a valid email' },
          },
        },
        400,
      ),
    );
    fireEvent.submit(screen.getByRole('form', { name: 'Registration' }));
    await screen.findByText('Enter a valid email');
    expect(screen.getByLabelText('Email address')).toHaveFocus();
    expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
      'Enter a valid email',
    );
    expect(password).toHaveAccessibleDescription(
      'At least 12 characters; at most 72 UTF-8 bytes.',
    );
  });
  it('disables editing and repeat submissions while login is pending', async () => {
    renderPage('/login');
    const password = await screen.findByLabelText('Password');
    let finish;
    fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const form = screen.getByRole('form', { name: 'Login' });
    fireEvent.submit(form);
    expect(form).toHaveAttribute('aria-busy', 'true');
    expect(password).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Logging in…' })).toBeDisabled();
    fireEvent.submit(form);
    expect(fetch).toHaveBeenCalledTimes(2);
    finish(reply({ error: { message: 'Invalid email or password' } }, 401));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid email or password',
    );
    expect(password).not.toBeDisabled();
    expect(screen.getByRole('alert')).toHaveFocus();
  });
  it('keeps home and registration navigation functional without unsupported recovery links', async () => {
    renderPage('/login');
    await screen.findByRole('form', { name: 'Login' });
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      screen.queryByRole('link', { name: /forgot|reset/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('link', { name: 'Create an account', exact: true }),
    );
    await screen.findByRole('form', { name: 'Registration' });
    expect(screen.getByLabelText('Password')).toHaveAttribute(
      'type',
      'password',
    );
    fireEvent.click(screen.getByRole('link', { name: 'Log in', exact: true }));
    await screen.findByRole('form', { name: 'Login' });
  });
});

describe('public authentication session restoration', () => {
  it.each(['/register', '/login'])(
    'renders %s when a missing or expired session returns HTTP 401',
    async (path) => {
      fetch.mockResolvedValueOnce(
        reply({ error: { message: 'Authentication required' } }, 401),
      );
      renderPage(path);
      expect(
        await screen.findByRole('form', {
          name: path === '/register' ? 'Registration' : 'Login',
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/couldn’t restore/)).not.toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({ credentials: 'include', method: 'GET' }),
      );
    },
  );
  it.each(['/register', '/login'])(
    'keeps an actual backend outage distinct from anonymous access on %s and recovers on retry',
    async (path) => {
      fetch.mockResolvedValueOnce(
        reply({ error: { message: 'Service unavailable' } }, 503),
      );
      renderPage(path);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'couldn’t restore your session',
      );
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      fetch.mockResolvedValueOnce(
        reply({ error: { message: 'Authentication required' } }, 401),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(
        await screen.findByRole('form', {
          name: path === '/register' ? 'Registration' : 'Login',
        }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );
});
