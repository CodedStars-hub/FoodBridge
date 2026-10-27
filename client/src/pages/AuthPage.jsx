import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  Utensils,
  HandHeart,
  HeartHandshake,
  Check,
  Info,
  CircleAlert,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { dashboardPath } from '../auth/AuthContext.js';
import AuthField from '../components/AuthField.jsx';
import SessionState from '../components/SessionState.jsx';
const roles = [
  {
    value: 'donor',
    label: 'Food donor',
    description: 'Share surplus food',
    icon: Utensils,
  },
  {
    value: 'ngo',
    label: 'NGO',
    description: 'Support a community',
    icon: HandHeart,
  },
  {
    value: 'volunteer',
    label: 'Volunteer',
    description: 'Help with pickups',
    icon: HeartHandshake,
  },
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
  const form = useRef(null);
  const alert = useRef(null);
  const { user, status, authenticate } = useAuth();
  useEffect(() => {
    if (error)
      (
        form.current?.querySelector('[aria-invalid="true"]') || alert.current
      )?.focus();
  }, [error, fields]);
  if (status === 'loading' || status === 'error') return <SessionState />;
  if (user) return <Navigate to={dashboardPath(user.role)} replace />;
  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
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
    <section className="auth-form-panel" aria-labelledby="auth-title">
      <div className="auth-form-heading">
        <p className="auth-kicker">
          {registering
            ? 'Find your place at the table'
            : 'Your community awaits'}
        </p>
        <h1 id="auth-title">
          {registering ? 'Create your account' : 'Log in to FoodBridge'}
        </h1>
        <p>
          {registering
            ? 'Choose how you’d like to take part. Start something good.'
            : 'Welcome back. Let’s pick up where your purpose left off.'}
        </p>
      </div>
      <form
        ref={form}
        onSubmit={submit}
        aria-label={registering ? 'Registration' : 'Login'}
        aria-busy={submitting}
      >
        {registering && (
          <fieldset
            className="auth-roles"
            disabled={submitting}
            aria-describedby={fields.role ? 'auth-role-error' : undefined}
          >
            <legend>I’m joining as a</legend>
            <div>
              {roles.map(({ value, label, description, icon: Icon }) => (
                <label
                  key={value}
                  className={`auth-role-card${role === value ? ' is-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={value}
                    checked={role === value}
                    onChange={() => setRole(value)}
                    aria-labelledby={`auth-role-${value}`}
                    aria-describedby={`auth-role-${value}-description`}
                    aria-invalid={!!fields.role}
                  />
                  <span className="auth-role-top">
                    <Icon size={23} strokeWidth={1.4} aria-hidden="true" />
                    <span className="auth-role-check" aria-hidden="true">
                      {role === value && <Check size={12} />}
                    </span>
                  </span>
                  <span id={`auth-role-${value}`} className="auth-role-name">
                    {label}
                  </span>
                  <span
                    id={`auth-role-${value}-description`}
                    className="auth-role-description"
                  >
                    {description}
                  </span>
                </label>
              ))}
            </div>
            {fields.role && (
              <span id="auth-role-error" className="auth-field-error">
                {fields.role}
              </span>
            )}
          </fieldset>
        )}
        {registering && (
          <AuthField
            name="name"
            label="Full name"
            autoComplete="name"
            required
            maxLength={100}
            error={fields.name}
            disabled={submitting}
          />
        )}
        <AuthField
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          placeholder="you@example.com"
          error={fields.email}
          disabled={submitting}
        />
        {registering && role === 'ngo' && (
          <AuthField
            name="organizationName"
            label="Organization name"
            autoComplete="organization"
            required
            maxLength={150}
            error={fields.organizationName}
            disabled={submitting}
          />
        )}
        <AuthField
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
          <AuthField
            name="phone"
            label="Phone (optional)"
            type="tel"
            autoComplete="tel"
            maxLength={30}
            error={fields.phone}
            disabled={submitting}
          />
        )}
        {error && (
          <div
            ref={alert}
            className="auth-form-error"
            role="alert"
            tabIndex={-1}
          >
            <CircleAlert size={18} aria-hidden="true" />
            <div>
              {error}
              {fields.form && <p>{fields.form}</p>}
            </div>
          </div>
        )}
        <button
          className="auth-submit-button"
          type="submit"
          disabled={submitting}
        >
          {submitting ? (
            <>
              <span className="auth-spinner" aria-hidden="true" />
              {registering ? 'Creating account…' : 'Logging in…'}
            </>
          ) : (
            <>
              {registering ? 'Create account' : 'Log in'}
              <ArrowUpRight size={18} aria-hidden="true" />
            </>
          )}
        </button>
        {registering && (
          <div className="auth-verification-note">
            <Info size={17} aria-hidden="true" />
            <p>
              New accounts begin with pending verification. NGOs must be
              verified before requesting food; volunteers before claiming
              pickups. Verification is handled by the platform administrator.
            </p>
          </div>
        )}
      </form>
      <p className="auth-form-switch">
        {registering ? 'Already part of the community?' : 'New to FoodBridge?'}{' '}
        <Link to={registering ? '/login' : '/register'}>
          {registering ? 'Log in' : 'Create an account'}
          <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      </p>
    </section>
  );
}
