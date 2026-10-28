import { afterEach, expect, it, vi } from 'vitest';
import { api } from './api.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function pendingFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ),
  );
}

it('bounds stalled submissions without retrying a potentially saved listing', async () => {
  vi.useFakeTimers();
  pendingFetch();
  const result = expect(
    api('/donations', { method: 'POST', body: {}, timeoutMs: 100 }),
  ).rejects.toThrow('Check your donations before submitting again');
  await vi.advanceTimersByTimeAsync(100);
  await result;
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).toMatchObject({
    credentials: 'include',
    headers: { 'X-CSRF-Protection': 'foodbridge' },
  });
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves caller cancellation and clears its deadline', async () => {
  vi.useFakeTimers();
  pendingFetch();
  const controller = new AbortController();
  const result = expect(
    api('/donations', { signal: controller.signal }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await result;
  expect(vi.getTimerCount()).toBe(0);
});

it('explains HTML responses from an incorrect API URL', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => {
        throw new SyntaxError('HTML');
      },
    }),
  );
  await expect(api('/donations')).rejects.toThrow('Check the API URL');
});

it('retains server validation errors and field details', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({
        status: 400,
        ok: false,
        json: async () => ({
          error: { message: 'Invalid donation', fields: { title: 'Required' } },
        }),
      }),
  );
  await expect(api('/donations')).rejects.toMatchObject({
    message: 'Invalid donation',
    status: 400,
    fields: { title: 'Required' },
  });
});
