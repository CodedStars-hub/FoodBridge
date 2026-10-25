import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  Leaf,
  HandHeart,
  Utensils,
  HeartHandshake,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { dashboardPath } from '../auth/AuthContext.js';
import FormField from '../components/FormField.jsx';
import SessionState from '../components/SessionState.jsx';
const roles = [
  { value: 'donor', label: 'Food donor', icon: Utensils },
  { value: 'ngo', label: 'NGO', icon: HandHeart },
  { value: 'volunteer', label: 'Volunteer', icon: HeartHandshake },
];
export default function AuthPage({ mode }) {
  const registering = mode === 'register';
  const [params] = useSearchParams();
  const [role, setRole] = useState(
    roles.some((item) => item.value === params.get('role'))
      ? params.get('role')
      : 'donor',
  );
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const { user, status, authenticate } = useAuth();
  if (status === 'loading' || status === 'error') return <SessionState />;
  if (user) return <Navigate to={dashboardPath(user.role)} replace />;
  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setFields({});
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (registering) values.role = role;
    try {
      await authenticate(mode, values);
    } catch (failure) {
      setError(
        failure.message === 'Failed to fetch'
          ? 'Unable to connect. Please try again.'
          : failure.message,
      );
      setFields(failure.fields || {});
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <section className="container auth-page">
      <aside className="auth-story">
        <span className="eyebrow">A SHARED TABLE. A SHARED PURPOSE.</span>
        <h1>
          {registering ? (
            <>
              A little action.
              <br />
              <span>Lasting good.</span>
            </>
          ) : (
            <>
              Good to have
              <br />
              <span>you back.</span>
            </>
          )}
        </h1>
        <p>
          Connect with a community that believes good food deserves a greater
          purpose.
        </p>
        <div className="auth-story-art" aria-hidden="true">
          <Leaf size={105} strokeWidth={1} />
        </div>
        <div className="auth-story-note">
          <HandHeart size={22} />
          <p>
            For food donors, NGOs, and volunteers.
            <br />
            <strong>Better together, by nature.</strong>
          </p>
        </div>
      </aside>
      <div className="auth-form-card">
        <span className="eyebrow">
          {registering ? 'JOIN FOODBRIDGE' : 'YOUR COMMUNITY AWAITS'}
        </span>
        <h2>{registering ? 'Create your account' : 'Log in to FoodBridge'}</h2>
        <p className="auth-subtitle">
          {registering
            ? 'Choose your role and take the first step.'
            : 'Pick up where your purpose left off.'}
        </p>
        <form
          onSubmit={submit}
          aria-label={registering ? 'Registration' : 'Login'}
        >
          {registering && (
            <fieldset className="role-picker" disabled={submitting}>
              <legend>I’m joining as a</legend>
              <div>
                {roles.map(({ value, label, icon: Icon }) => (
                  <label
                    key={value}
                    className={
                      role === value ? 'role-option selected' : 'role-option'
                    }
                  >
                    <input
                      type="radio"
                      name="role"
                      value={value}
                      checked={role === value}
                      onChange={() => setRole(value)}
                    />
                    <Icon size={21} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {registering && (
            <FormField
              name="name"
              label="Full name"
              autoComplete="name"
              required
              maxLength={100}
              error={fields.name}
              disabled={submitting}
            />
          )}
          <FormField
            name="email"
            label="Email address"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            error={fields.email}
            disabled={submitting}
          />
          <FormField
            name="password"
            label="Password"
            type="password"
            autoComplete={registering ? 'new-password' : 'current-password'}
            required
            minLength={registering ? 12 : 1}
            maxLength={registering ? 72 : 1024}
            hint={
              registering
                ? 'At least 12 characters; at most 72 UTF-8 bytes.'
                : undefined
            }
            error={fields.password}
            disabled={submitting}
          />
          {registering && (
            <>
              <FormField
                name="phone"
                label="Phone (optional)"
                type="tel"
                autoComplete="tel"
                maxLength={30}
                error={fields.phone}
                disabled={submitting}
              />
              {role === 'ngo' && (
                <FormField
                  name="organizationName"
                  label="Organization name"
                  autoComplete="organization"
                  required
                  maxLength={150}
                  error={fields.organizationName}
                  disabled={submitting}
                />
              )}
            </>
          )}
          {error && (
            <div className="form-alert" role="alert">
              {error}
              {fields.form && <p>{fields.form}</p>}
            </div>
          )}
          <button
            className="button auth-submit"
            disabled={submitting}
            type="submit"
          >
            {submitting
              ? registering
                ? 'Creating account…'
                : 'Logging in…'
              : registering
                ? 'Create account'
                : 'Log in'}
            <ArrowUpRight size={18} />
          </button>
        </form>
        <p className="auth-switch">
          {registering
            ? 'Already part of the community?'
            : 'New to FoodBridge?'}{' '}
          <Link to={registering ? '/login' : '/register'}>
            {registering ? 'Log in' : 'Create an account'}
          </Link>
        </p>
        {registering && (
          <p className="field-hint auth-note">
            New accounts begin with pending verification. No email or
            organization verification service is enabled yet.
          </p>
        )}
      </div>
    </section>
  );
}
