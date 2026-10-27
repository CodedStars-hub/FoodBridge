import { useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import LocationFields from './LocationFields.jsx';
import { locationInput } from '../utils/location.js';
import FormField from './FormField.jsx';
import { useAuth } from '../auth/useAuth.js';
export default function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const form = useRef(null);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setFields({});
    setSaved(false);
    try {
      await updateProfile(
        locationInput(
          Object.fromEntries(new FormData(event.currentTarget)),
          user,
        ),
      );
      setSaved(true);
    } catch (failure) {
      setError(failure.message);
      setFields(failure.fields || {});
      requestAnimationFrame(() => {
        const target =
          form.current?.querySelector('[aria-invalid="true"]') ||
          form.current?.querySelector('[role="alert"]');
        target?.focus();
      });
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
      <form ref={form} onSubmit={submit} aria-label="Profile" aria-busy={busy}>
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
        <LocationFields
          key={user.id}
          location={user.location}
          address={user.address}
          includeAddress
          disabled={busy}
          error={fields.location || fields.address}
        />
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
          <p role="alert" className="form-alert" tabIndex={-1}>
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
