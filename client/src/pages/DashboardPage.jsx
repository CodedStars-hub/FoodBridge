import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  UserRound,
  LogOut,
  Sprout,
  ArrowUpRight,
  Clock3,
  ShieldCheck,
} from 'lucide-react';
import { Brand } from '../components/Layout.jsx';
import FormField from '../components/FormField.jsx';
import { useAuth } from '../auth/useAuth.js';
const content = {
  donor: {
    title: 'A little surplus. A lot of possibility.',
    description: 'Your space to help good food go further.',
    sections: ['Food donations', 'Collection coordination', 'Donation history'],
  },
  ngo: {
    title: 'Bring more possibility to your community.',
    description: 'Your space to connect your organization with food rescue.',
    sections: [
      'Available food',
      'Collection requests',
      'Community connections',
    ],
  },
  volunteer: {
    title: 'Small actions move communities forward.',
    description: 'Your space to lend a hand in food rescue.',
    sections: [
      'Pickup opportunities',
      'Volunteer availability',
      'Collection history',
    ],
  },
  admin: {
    title: 'A stronger foundation for shared good.',
    description: 'Your space to support a trusted FoodBridge community.',
    sections: [
      'Account verification',
      'Community management',
      'Platform oversight',
    ],
  },
};
function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    setSaved(false);
    try {
      await updateProfile(
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      setSaved(true);
    } catch (failure) {
      setError(failure.message);
      setFields(failure.fields || {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="profile"
      className="profile-card"
      aria-labelledby="profile-title"
    >
      <div className="dashboard-section-title">
        <div>
          <span className="eyebrow">YOUR ACCOUNT</span>
          <h2 id="profile-title">Profile details</h2>
        </div>
        <UserRound size={25} />
      </div>
      <p className="dashboard-muted">
        Your role and verification status are managed by FoodBridge.
      </p>
      <form onSubmit={submit} aria-label="Profile">
        <div className="profile-fields">
          <FormField
            name="name"
            label="Full name"
            autoComplete="name"
            defaultValue={user.name}
            required
            maxLength={100}
            error={fields.name}
            disabled={busy}
          />
          <FormField
            name="phone"
            label="Phone (optional)"
            autoComplete="tel"
            type="tel"
            defaultValue={user.phone}
            maxLength={30}
            error={fields.phone}
            disabled={busy}
          />
          {(user.role === 'ngo' || user.organizationName) && (
            <FormField
              name="organizationName"
              label="Organization name"
              autoComplete="organization"
              defaultValue={user.organizationName}
              required
              maxLength={150}
              error={fields.organizationName}
              disabled={busy}
            />
          )}
        </div>
        <div className="account-facts">
          <span>
            Email <strong>{user.email}</strong>
          </span>
          <span>
            Role <strong>{user.role}</strong>
          </span>
          <span>
            Verification <strong>{user.verificationStatus}</strong>
          </span>
        </div>
        {error && (
          <p role="alert" className="form-alert">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="save-success">
            Your profile has been updated.
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </section>
  );
}
export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const details = content[user.role];
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
  return (
    <div className="dashboard-shell">
      <a href="#dashboard-main" className="skip-link">
        Skip to dashboard
      </a>
      <aside className="dashboard-sidebar">
        <Brand />
        <div className="workspace-label">{user.role} workspace</div>
        <nav aria-label="Dashboard navigation">
          <a className="sidebar-link active" href="#overview">
            <LayoutDashboard size={18} />
            Overview
          </a>
          <a className="sidebar-link" href="#profile">
            <UserRound size={18} />
            My profile
          </a>
        </nav>
        <div className="sidebar-purpose">
          <Sprout size={29} />
          <strong>Good grows together.</strong>
          <p>One community. A shared purpose.</p>
        </div>
        <Link className="sidebar-home" to="/">
          Visit FoodBridge <ArrowUpRight size={15} />
        </Link>
      </aside>
      <div className="dashboard-body">
        <header className="dashboard-header">
          <span>
            My workspace <span className="header-divider">/</span>{' '}
            <strong>{user.role}</strong>
          </span>
          <div className="dashboard-user">
            <span className="avatar" aria-hidden="true">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <span>{user.name}</span>
            <button className="logout-button" onClick={signOut} disabled={busy}>
              <LogOut size={17} />
              {busy ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        </header>
        <main id="dashboard-main" className="dashboard-main">
          <section id="overview" className="dashboard-welcome">
            <span className="eyebrow">
              WELCOME, {user.name.split(' ')[0].toUpperCase()}
            </span>
            <h1>{details.title}</h1>
            <p>{details.description}</p>
            <span className="verification-badge">
              <ShieldCheck size={15} />
              Verification: {user.verificationStatus}
            </span>
          </section>
          {error && (
            <p className="form-alert" role="alert">
              {error}
            </p>
          )}
          <div className="dashboard-section-title">
            <h2>Your workspace</h2>
            <span className="coming-label">
              Foundation ready · More coming soon
            </span>
          </div>
          <div className="dashboard-modules">
            {details.sections.map((title) => (
              <article className="dashboard-module" key={title}>
                <Clock3 size={23} />
                <span className="coming-label">Upcoming feature</span>
                <h3>{title}</h3>
                <p>This module will be introduced in a future milestone.</p>
              </article>
            ))}
          </div>
          <p className="dashboard-disclaimer">
            No operational data or activity metrics are displayed. Your account
            and profile are live.
          </p>
          <ProfileForm />
        </main>
        <footer className="dashboard-footer">
          FoodBridge · Less waste. More possibility.
        </footer>
      </div>
    </div>
  );
}
