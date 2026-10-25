const baseUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
export async function api(path, { method = 'GET', body, signal } = {}) {
  const multipart = body instanceof FormData;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    credentials: 'include',
    signal,
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
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(
      data?.error?.message || 'Something went wrong. Please try again',
    );
    error.status = response.status;
    error.fields = data?.error?.fields || {};
    throw error;
  }
  return data;
}
