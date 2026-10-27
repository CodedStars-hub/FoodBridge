import { api } from './api.js';
export function inboxChanged() {
  window.dispatchEvent(new Event('foodbridge:inbox-changed'));
}
export async function markRead(id) {
  await api(`/notifications/${id}/read`, { method: 'PATCH' });
  inboxChanged();
}
export async function markAllRead() {
  await api('/notifications/read-all', { method: 'PATCH' });
  inboxChanged();
}

// Links stay within routes available to the recipient's existing role.
export function notificationTarget(role, item) {
  const base = `/dashboard/${role}`;
  if (role === 'admin') return `${base}/analytics`;
  if (role === 'volunteer')
    return item.requestId
      ? `${base}/pickups/${item.requestId}`
      : `${base}/pickups`;
  if (item.requestId) return `${base}/requests`;
  if (item.donationId) return `${base}/donations/${item.donationId}`;
  return base;
}
