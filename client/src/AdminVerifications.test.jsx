import { afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminVerifications from './pages/AdminVerifications.jsx';
const user = {
  _id: 'vol-1',
  name: 'Demo Volunteer',
  role: 'volunteer',
  email: 'vol@example.test',
  verificationStatus: 'pending',
};
const reply = (body) => ({ ok: true, status: 200, json: async () => body });
afterEach(() => vi.unstubAllGlobals());
it.each([
  ['Approve', 'verified'],
  ['Reject', 'rejected'],
])(
  'submits %s through the review endpoint and refreshes the queue',
  async (label, status) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async (_url, options) =>
          reply(
            options.method === 'PATCH'
              ? { user: { ...user, verificationStatus: status } }
              : { items: [user], pagination: { page: 1, pages: 1, total: 1 } },
          ),
        ),
    );
    render(<AdminVerifications />);
    fireEvent.click(
      await screen.findByRole('button', { name: `${label} Demo Volunteer` }),
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/admin/verifications/vol-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status, previousStatus: 'pending' }),
        }),
      ),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  },
);
