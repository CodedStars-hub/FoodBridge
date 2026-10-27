import { Bell, CheckCheck, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { useInbox } from '../hooks/useInbox.js';
import { markRead, markAllRead, notificationTarget } from '../utils/inbox.js';
import { DataState, Pagination } from '../components/DonationShared.jsx';
export default function NotificationsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [unread, setUnread] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const [notice, setNotice] = useState('');
  const result = useInbox(
    `page=${page}&limit=20${unread ? '&unread=true' : ''}`,
  );
  async function read(id) {
    if (pending) return;
    setPending(id || 'all');
    setError('');
    setNotice('');
    try {
      if (id) await markRead(id);
      else await markAllRead();
      setNotice(
        id
          ? 'Notification marked as read.'
          : 'All notifications marked as read.',
      );
    } catch {
      setError('Unable to update notifications. Please try again.');
    } finally {
      setPending('');
    }
  }
  return (
    <section className="workspace-page notifications-page">
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
          disabled={!!pending || !result.data?.unreadCount}
          onClick={() => read()}
        >
          <CheckCheck size={17} aria-hidden="true" />
          {pending === 'all' ? 'Marking all read…' : 'Mark all read'}
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
        <span className="inbox-unread-total">
          {result.data?.unreadCount ?? '—'} unread
        </span>
      </div>
      {notice && (
        <p className="inbox-feedback" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}
      <DataState
        {...result}
        retry={result.refresh}
        empty={result.data?.items.length === 0}
        emptyContent={
          <div className="workspace-state inbox-empty">
            <Bell size={30} strokeWidth={1.3} aria-hidden="true" />
            <h2>
              {unread ? 'You’re all caught up.' : 'A little quiet, for now.'}
            </h2>
            <p>
              {unread
                ? 'There are no unread notifications. Your read updates remain in the full inbox.'
                : 'Updates from your food rescue activity will appear here.'}
            </p>
            {unread && (
              <button
                className="button button-outline"
                onClick={() => {
                  setUnread(false);
                  setPage(1);
                }}
              >
                Show all notifications
              </button>
            )}
          </div>
        }
      >
        <ul className="notification-center-list">
          {result.data?.items.map((item) => (
            <li key={item.id} className={item.readAt ? '' : 'unread'}>
              <span className="inbox-item-icon">
                <Bell size={20} aria-hidden="true" />
              </span>
              <div className="inbox-item-content">
                <div className="inbox-item-meta">
                  <span className="inbox-read-state">
                    {item.readAt ? 'Read' : 'Unread'}
                  </span>
                  <span className="eyebrow">
                    {item.type.replaceAll('_', ' ')}
                  </span>
                </div>
                <h2 id={`notification-message-${item.id}`}>{item.message}</h2>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString()}
                </time>
                <Link
                  className="text-link"
                  to={notificationTarget(user.role, item)}
                >
                  View activity <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              </div>
              {!item.readAt && (
                <button
                  className="button button-outline"
                  disabled={!!pending}
                  aria-describedby={`notification-message-${item.id}`}
                  onClick={() => read(item.id)}
                >
                  {pending === item.id ? 'Marking read…' : 'Mark as read'}
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
