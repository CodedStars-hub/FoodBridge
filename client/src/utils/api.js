const baseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export async function api(
  path,
  { method = 'GET', body, signal, timeoutMs = 90000 } = {},
) {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const multipart = body instanceof FormData;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      credentials: 'include',
      signal: controller.signal,
      headers:
        method === 'GET'
          ? {}
          : {
              ...(multipart ? {} : { 'Content-Type': 'application/json' }),
              'X-CSRF-Protection': 'foodbridge',
            },
      ...(method !== 'GET'
        ? { body: multipart ? body : JSON.stringify(body ?? {}) }
        : {}),
    });
    let data = null;
    if (response.status !== 204) {
      try {
        data = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        throw new Error(
          `The API returned an unexpected response (HTTP ${response.status}). Check the API URL or try again after the server starts`,
        );
      }
    }
    if (!response.ok) {
      const error = new Error(
        data?.error?.message || 'Something went wrong. Please try again',
      );
      error.status = response.status;
      error.fields = data?.error?.fields || {};
      throw error;
    }
    return data;
  } catch (error) {
    if (timedOut)
      throw new Error(
        'The server took too long to respond. It may be starting up. Check your donations before submitting again; the listing may already have been saved',
      );
    if (error instanceof TypeError && !controller.signal.aborted)
      throw new Error(
        'Cannot reach the API. Check your connection and try again. If this continues, check the API URL and allowed origin',
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
