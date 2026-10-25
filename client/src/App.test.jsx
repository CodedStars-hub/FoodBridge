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
    vi
      .fn()
      .mockResolvedValue(
        reply({ error: { message: 'Authentication required' } }, 401),
      ),
  ),
);
afterEach(() => vi.unstubAllGlobals());
describe('FoodBridge application shell', () => {
  it('preserves the landing page and donor/NGO calls to action', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Good food.Greater purpose.',
    );
    expect(
      screen.getByRole('link', { name: 'I want to donate food' }),
    ).toHaveAttribute('href', '/register?role=donor');
    expect(screen.getByRole('link', { name: 'I’m an NGO' })).toHaveAttribute(
      'href',
      '/register?role=ngo',
    );
    expect(
      screen.getByRole('heading', { name: 'From extra to extraordinary.' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });
  it('carries donor intent through navigation', async () => {
    renderPage();
    fireEvent.click(
      screen.getByRole('link', { name: 'I want to donate food' }),
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
    const button = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(fetch).toHaveBeenCalled());
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
    expect(screen.getAllByText('Upcoming feature')).toHaveLength(3);
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
    expect(fetch).toHaveBeenLastCalledWith(
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
