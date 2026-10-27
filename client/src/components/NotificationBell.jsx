import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { useInbox } from '../hooks/useInbox.js';
import {
  inboxChanged,
  markRead,
  markAllRead,
  notificationTarget,
} from '../utils/inbox.js';
export default function NotificationBell() {
  const { user } = useAuth();
  const inbox = useInbox();
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const button = useRef(null);
  const root = useRef(null);
  const id = useId();
  useEffect(() => {
    let cancelled = false;
    let socket;
    import('socket.io-client')
      .then(({ io }) => {
        if (cancelled) return;
        const origin = new URL(
          import.meta.env.VITE_API_URL || '/api',
          window.location.origin,
        ).origin;
        socket = io(origin, {
          withCredentials: true,
          transports: ['websocket'],
          autoConnect: false,
        });
        socket.on('connect', () => {
          setConnected(true);
          inboxChanged();
        });
        socket.on('notifications:sync', inboxChanged);
        socket.on('notifications:changed', inboxChanged);
        socket.on('disconnect', () => setConnected(false));
        socket.on('connect_error', () => setConnected(false));
        socket.connect();
      })
      .catch(() => setConnected(false));
    const poll = setInterval(inboxChanged, 30000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      socket?.disconnect();
    };
  }, [user.id]);
  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      } else if (
        event.type === 'pointerdown' &&
        !root.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);
  const count = inbox.data?.unreadCount;
  async function read(id) {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await markRead(id);
      setOpen(false);
      button.current?.focus();
    } catch {
      setError('Unable to mark notification read. Please retry.');
    } finally {
      setPending(false);
    }
  }
  async function readAll() {
    if (pending) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      await markAllRead();
      setNotice('All notifications marked as read.');
    } catch {
      setError('Unable to mark notifications read. Please retry.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="notification-root" ref={root}>
      <button
        ref={button}
        className="notification-bell"
        aria-label={
          count === undefined
            ? 'Notifications'
            : `Notifications, ${count} unread`
        }
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
          if (!open) {
            setError('');
            setNotice('');
            inbox.refresh();
          }
        }}
      >
        <Bell size={19} />
        {count > 0 && (
          <span className="notification-count" aria-hidden="true">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <section
          id={id}
          className="notification-dropdown"
          aria-label="Notifications"
        >
          <div className="notification-top">
            <h2>Notifications</h2>
            <span
              className={connected ? 'live-indicator' : 'offline-indicator'}
            >
              {connected ? 'Live' : 'Inbox sync'}
            </span>
          </div>
          {inbox.loading ? (
            <p role="status">Loading notifications…</p>
          ) : inbox.error ? (
            <p role="alert">
              Notifications are unavailable. Open the center to retry.
            </p>
          ) : inbox.data?.items.length === 0 ? (
            <p className="notification-empty">
              You’re all caught up. Updates from your food rescue activity will
              appear here.
            </p>
          ) : (
            <ul className="notification-list">
              {inbox.data?.items.map((item) => (
                <li key={item.id} className={item.readAt ? '' : 'unread'}>
                  <Link
                    to={notificationTarget(user.role, item)}
                    onClick={() => void read(item.id)}
                  >
                    <span className="inbox-read-state">
                      {item.readAt ? 'Read' : 'Unread'}
                    </span>
                    <span className="notification-message">{item.message}</span>
                    <time dateTime={item.createdAt}>
                      {new Date(item.createdAt).toLocaleString()}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {notice && (
            <p role="status" className="inbox-feedback">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="notification-bottom">
            <button
              className="text-link"
              disabled={pending || !count}
              onClick={readAll}
            >
              <CheckCheck size={15} />
              {pending ? 'Updating…' : 'Mark all read'}
            </button>
            <Link
              className="text-link"
              to={`/dashboard/${user.role}/notifications`}
              onClick={() => setOpen(false)}
            >
              View all →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
