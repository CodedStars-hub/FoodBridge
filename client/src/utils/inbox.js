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
