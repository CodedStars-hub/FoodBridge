import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { useInbox } from '../hooks/useInbox.js';
import { markRead, markAllRead } from '../utils/inbox.js';
import { DataState, Pagination } from '../components/DonationShared.jsx';
export default function NotificationsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [unread, setUnread] = useState(false);
  const [error, setError] = useState('');
  const result = useInbox(
    `page=${page}&limit=20${unread ? '&unread=true' : ''}`,
  );
  async function read(id) {
    try {
      if (id) await markRead(id);
      else await markAllRead();
      setError('');
    } catch {
      setError('Unable to update notifications. Please try again.');
    }
  }
  return (
    <section className="workspace-page">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">YOUR FOOD RESCUE ACTIVITY</span>
          <h1>Notification center</h1>
          <p>
            Persistent updates from requests, reservations and pickups.
            Reconnecting reloads your inbox.
          </p>
        </div>
        <button
          className="button button-outline"
          disabled={!result.data?.unreadCount}
          onClick={() => read()}
        >
          Mark all read
        </button>
      </div>
      <div className="inbox-tools">
        <label>
          <input
            type="checkbox"
            checked={unread}
            onChange={(event) => {
              setUnread(event.target.checked);
              setPage(1);
            }}
          />
          Unread only
        </label>
        <button className="text-link" onClick={result.refresh}>
          Refresh inbox
        </button>
        <span>{result.data?.unreadCount ?? '—'} unread</span>
      </div>
      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}
      <DataState
        {...result}
        retry={result.refresh}
        empty={result.data?.items.length === 0}
      >
        <ul className="notification-center-list">
          {result.data?.items.map((item) => (
            <li key={item.id} className={item.readAt ? '' : 'unread'}>
              <div>
                <span className="eyebrow">
                  {item.type.replaceAll('_', ' ')}
                </span>
                <h2>{item.message}</h2>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString()}
                </time>
                <Link
                  className="text-link"
                  to={`/dashboard/${user.role}/${user.role === 'volunteer' && item.requestId ? `pickups/${item.requestId}` : 'requests'}`}
                >
                  View activity →
                </Link>
              </div>
              {!item.readAt && (
                <button
                  className="button button-outline"
                  onClick={() => read(item.id)}
                >
                  Mark as read
                </button>
              )}
            </li>
          ))}
        </ul>
        <Pagination pagination={result.data?.pagination} onPage={setPage} />
      </DataState>
    </section>
  );
}
