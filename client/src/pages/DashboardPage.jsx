import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useOutlet } from 'react-router-dom';
import {
  LayoutDashboard,
  UserRound,
  LogOut,
  ArrowUpRight,
  Plus,
  HandHeart,
  Truck,
  History,
  BarChart3,
  Bell,
  Menu,
  X,
  ChevronDown,
  Leaf,
  Search,
  MapPin,
} from 'lucide-react';
import { PublicBrand } from '../components/PublicSite.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import ProfileForm from '../components/ProfileForm.jsx';
import DonorOverview from './DonorOverview.jsx';
import AdminOverview from './AdminOverview.jsx';
import { NgoOverview, VolunteerOverview } from './CommunityOverview.jsx';
import { useAuth } from '../auth/useAuth.js';
import '../workspace-shell.css';
import '../donor-workspace.css';
import '../community-workspace.css';
import '../workspace-insights.css';
const routeLabels = {
  donations: 'My donations',
  new: 'Create donation',
  edit: 'Edit donation',
  requests: 'Incoming requests',
  history: 'Donation history',
  pickups: 'Pickup status',
  analytics: 'Analytics',
  notifications: 'Notifications',
  explore: 'Explore donations',
  recommended: 'Recommended donations',
  nearby: 'Nearby donations',
  available: 'Available pickups',
};
export default function DashboardPage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const outlet = useOutlet();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [drawer, setDrawer] = useState(false),
    [account, setAccount] = useState(false);
  const dialog = useRef(null),
    toggle = useRef(null),
    accountButton = useRef(null),
    accountRoot = useRef(null);
  const base = `/dashboard/${user.role}`;
  const roleLabel = user.role === 'ngo' ? 'NGO' : user.role;
  useEffect(() => {
    if (drawer) dialog.current?.showModal();
  }, [drawer]);
  useEffect(() => {
    if (location.hash === '#profile')
      document
        .getElementById('profile')
        ?.scrollIntoView?.({ behavior: 'instant' });
  }, [location.pathname, location.hash]);
  useEffect(() => {
    if (!account) return;
    const close = (e) => {
      if (e.key === 'Escape') {
        setAccount(false);
        accountButton.current?.focus();
      } else if (
        e.type === 'pointerdown' &&
        !accountRoot.current?.contains(e.target)
      )
        setAccount(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [account]);
  const links =
    user.role === 'donor'
      ? [
          ['My donations', 'donations', Leaf],
          ['Create donation', 'donations/new', Plus],
          ['Incoming requests', 'requests', HandHeart],
          ['Pickup status', 'pickups', Truck],
          ['Donation history', 'history', History],
        ]
      : user.role === 'ngo'
        ? [
            ['Explore donations', 'explore', Search],
            ['Recommended donations', 'recommended', Leaf],
            ['Nearby donations', 'nearby', MapPin],
            ['My requests', 'requests', HandHeart],
            ['Delivery tracking', 'pickups', Truck],
            ['Donation history', 'history', History],
          ]
        : user.role === 'volunteer'
          ? [
              ['Available pickups', 'pickups/available', Truck],
              ['My assignments', 'pickups', History],
            ]
          : [];
  function closeDrawer() {
    dialog.current?.close();
    setDrawer(false);
    toggle.current?.focus();
  }
  function navigation(mobile = false) {
    return (
      <>
        <PublicBrand />
        <p className="ws-workspace">{roleLabel} workspace</p>
        <nav
          aria-label="Dashboard navigation"
          onClick={() => {
            if (mobile) closeDrawer();
          }}
        >
          <span className="ws-nav-label">Workspace</span>
          <NavLink
            end
            to={base}
            className={({ isActive }) =>
              `ws-nav-link${isActive && !location.hash ? ' active' : ''}`
            }
          >
            <LayoutDashboard size={18} />
            Overview
          </NavLink>
          {links.map(([label, path, Icon]) => (
            <NavLink
              key={path}
              end={
                !['donations', 'pickups'].includes(path) ||
                segments.includes('new') ||
                segments.includes('available')
              }
              to={`${base}/${path}`}
              className={({ isActive }) =>
                `ws-nav-link${isActive && !(path === 'donations' && segments.includes('new')) && !(path === 'pickups' && segments.includes('available')) ? ' active' : ''}`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
          <span className="ws-nav-label">Your account</span>
          <NavLink to={`${base}/analytics`} className="ws-nav-link">
            <BarChart3 size={18} />
            Analytics
          </NavLink>
          <NavLink to={`${base}/notifications`} className="ws-nav-link">
            <Bell size={18} />
            Notifications
          </NavLink>
          <Link
            className={`ws-nav-link${location.hash === '#profile' ? ' active' : ''}`}
            to={`${base}#profile`}
          >
            <UserRound size={18} />
            My profile
          </Link>
        </nav>
        <div className="ws-sidebar-note">
          <Leaf size={22} />
          <p>
            Good food.
            <br />
            <em>Shared possibility.</em>
          </p>
          <Link to="/">
            Visit FoodBridge <ArrowUpRight size={14} />
          </Link>
        </div>
        <div className="ws-sidebar-user">
          <span className="ws-avatar">{user.name.charAt(0)}</span>
          <div>
            <strong>{user.name}</strong>
            <span>{user.verificationStatus} verification</span>
          </div>
        </div>
      </>
    );
  }
  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await logout();
    } catch {
      setError('Unable to log out. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  const segments = location.pathname
    .slice(base.length)
    .split('/')
    .filter(Boolean);
  const roleLabels = {
    requests: user.role === 'donor' ? 'Incoming requests' : 'My requests',
    pickups:
      user.role === 'volunteer'
        ? 'My assignments'
        : user.role === 'ngo'
          ? 'Delivery tracking'
          : 'Pickup status',
  };
  const pageLabel =
    location.hash === '#profile'
      ? 'My profile'
      : segments.length
        ? roleLabels[segments.at(-1)] ||
          routeLabels[segments.at(-1)] ||
          (segments[0] === 'donations' ? 'Donation details' : 'Pickup details')
        : 'Overview';
  return (
    <div className="workspace-shell">
      <a href="#dashboard-main" className="ws-skip">
        Skip to dashboard
      </a>
      <aside className="ws-sidebar">{navigation()}</aside>
      {drawer && (
        <dialog
          ref={dialog}
          className="ws-drawer"
          aria-label="Workspace navigation"
          onCancel={() => closeDrawer()}
        >
          <button
            className="ws-drawer-close"
            aria-label="Close navigation"
            onClick={closeDrawer}
          >
            <X size={21} />
          </button>
          {navigation(true)}
        </dialog>
      )}
      <div className="ws-body">
        <header className="ws-header">
          <div className="ws-header-leading">
            <button
              ref={toggle}
              className="ws-menu-toggle"
              aria-label="Open workspace navigation"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <Menu size={21} />
            </button>
            <nav aria-label="Breadcrumb" className="ws-breadcrumb">
              <Link to={base}>{roleLabel} workspace</Link>
              <span>/</span>
              <strong aria-current="page">{pageLabel}</strong>
            </nav>
          </div>
          <div className="ws-header-actions">
            <NotificationBell />
            <div className="ws-account-root" ref={accountRoot}>
              <button
                ref={accountButton}
                className="ws-account-button"
                aria-label="Open profile menu"
                aria-expanded={account}
                onClick={() => setAccount(!account)}
              >
                <span className="ws-avatar">{user.name.charAt(0)}</span>
                <span>{user.name}</span>
                <ChevronDown size={14} />
              </button>
              {account && (
                <section className="ws-account-menu" aria-label="Account menu">
                  <strong>{user.name}</strong>
                  <p>{user.email}</p>
                  <span>
                    {user.role} · {user.verificationStatus}
                  </span>
                  <Link
                    to={`${base}#profile`}
                    onClick={() => setAccount(false)}
                  >
                    My profile <UserRound size={15} />
                  </Link>
                  <Link to="/">
                    FoodBridge home <ArrowUpRight size={15} />
                  </Link>
                </section>
              )}
            </div>
            <button
              className="ws-logout"
              aria-label={busy ? 'Logging out…' : 'Log out'}
              disabled={busy}
              onClick={signOut}
            >
              <LogOut size={16} />
              <span>{busy ? 'Logging out…' : 'Log out'}</span>
            </button>
          </div>
        </header>
        <main
          id="dashboard-main"
          className={`workspace-content ${user.role === 'donor' ? 'donor-workspace' : ['ngo', 'volunteer'].includes(user.role) ? 'community-workspace' : 'admin-workspace'}`}
          tabIndex={-1}
        >
          {error && (
            <p role="alert" className="form-alert">
              {error}
            </p>
          )}
          {outlet ||
            (user.role === 'donor' ? (
              <>
                <DonorOverview />
                <ProfileForm />
              </>
            ) : ['ngo', 'volunteer'].includes(user.role) ? (
              <>
                {user.role === 'ngo' ? <NgoOverview /> : <VolunteerOverview />}
                <ProfileForm />
              </>
            ) : (
              <>
                <AdminOverview />
                <ProfileForm />
              </>
            ))}
        </main>
        <footer className="ws-footer">
          <span>FoodBridge · Less waste. More possibility.</span>
          <span>Built around people.</span>
        </footer>
      </div>
    </div>
  );
}
