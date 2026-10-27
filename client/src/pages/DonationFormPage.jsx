import LocationFields from '../components/LocationFields.jsx';
import { locationInput } from '../utils/location.js';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Leaf, Check } from 'lucide-react';
import { api } from '../utils/api.js';
import { useApiData } from '../hooks/useApiData.js';
import { DataState } from '../components/DonationShared.jsx';
import { categoryOptions, unitOptions, readable } from '../utils/donation.js';
import FormField from '../components/FormField.jsx';
function localTime(value) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function DonationForm({ donation }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [fields, setFields] = useState({}),
    [photo, setPhoto] = useState(null);
  const form = useRef(null);
  const editing = !!donation;
  const [initialTime] = useState(() => Date.now());
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setFields({});
    const input = Object.fromEntries(new FormData(event.currentTarget));
    try {
      input.quantity = Number(input.quantity);
      input.preparationTime = new Date(input.preparationTime).toISOString();
      input.pickupDeadline = new Date(input.pickupDeadline).toISOString();
      locationInput(input, donation || {});
      if (
        photo &&
        (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) ||
          photo.size > 5 * 1024 * 1024)
      )
        throw new Error('Choose a JPEG, PNG or WebP image up to 5 MiB');
      const data = await api(
        editing ? `/donations/${donation._id}` : '/donations',
        { method: editing ? 'PATCH' : 'POST', body: input },
      );
      let imageError;
      if (photo) {
        const body = new FormData();
        body.append('file', photo);
        try {
          await api(`/donations/${data.donation._id}/image`, {
            method: 'POST',
            body,
          });
        } catch (failure) {
          imageError = failure.message;
        }
      }
      navigate(`/dashboard/donor/donations/${data.donation._id}`, {
        state: imageError ? { imageError } : null,
      });
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
  function selectField(name, label, options, value) {
    return (
      <div className="form-field">
        <label htmlFor={name}>{label}</label>
        <select
          id={name}
          name={name}
          defaultValue={value}
          aria-invalid={!!fields[name]}
          aria-describedby={fields[name] ? `${name}-error` : undefined}
        >
          {options.map((v) => (
            <option key={v} value={v}>
              {readable(v)}
            </option>
          ))}
        </select>
        {fields[name] && (
          <span className="field-error" id={`${name}-error`}>
            {fields[name]}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="donor-form-layout">
      <form
        ref={form}
        className="donation-form profile-card"
        onSubmit={submit}
        aria-label={editing ? 'Edit donation' : 'Create donation'}
        aria-busy={busy}
      >
        <fieldset disabled={busy}>
          <legend>01 · Food details</legend>
          <p className="donor-upload-intro">
            Give community partners a clear picture of what you’re sharing.
          </p>
          <FormField
            name="title"
            label="Donation title"
            required
            maxLength={120}
            defaultValue={donation?.title || ''}
            error={fields.title}
          />
          <div className="form-field">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              required
              maxLength={2000}
              defaultValue={donation?.description || ''}
              aria-invalid={!!fields.description}
              aria-describedby={
                fields.description ? 'description-error' : undefined
              }
            />
            {fields.description && (
              <span className="field-error" id="description-error">
                {fields.description}
              </span>
            )}
          </div>
          {selectField(
            'category',
            'Food category',
            categoryOptions,
            donation?.category || categoryOptions[0],
          )}
        </fieldset>
        <fieldset disabled={busy}>
          <legend>02 · Quantity & unit</legend>
          <div className="profile-fields">
            <FormField
              name="quantity"
              label="Total quantity"
              type="number"
              required
              min={1}
              max={1000000}
              step={1}
              defaultValue={donation?.quantity || ''}
              hint="Use whole units. Choose grams or millilitres for smaller amounts."
              error={fields.quantity}
            />
            {selectField(
              'unit',
              'Quantity unit',
              unitOptions,
              donation?.unit || 'servings',
            )}
          </div>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>03 · Preparation & storage</legend>
          <p className="declaration-note">
            Describe what you know about the food. These details are not a food
            safety certification. State known allergens, or that information is
            unknown.
          </p>
          <FormField
            name="preparationTime"
            label="Prepared at"
            type="datetime-local"
            required
            defaultValue={localTime(
              donation?.preparationTime || initialTime - 30 * 60000,
            )}
            error={fields.preparationTime}
          />
          {[
            ['storageConditions', 'Storage conditions'],
            ['packagingDetails', 'Packaging details'],
            ['handlingDetails', 'Handling details'],
            ['allergenInformation', 'Allergen information'],
          ].map(([name, label]) => (
            <FormField
              key={name}
              name={name}
              label={label}
              required
              maxLength={500}
              defaultValue={donation?.[name] || ''}
              error={fields[name]}
            />
          ))}
        </fieldset>
        <fieldset disabled={busy}>
          <legend>04 · Pickup window & place</legend>
          <FormField
            name="pickupDeadline"
            label="Pickup deadline"
            type="datetime-local"
            required
            defaultValue={localTime(
              donation?.pickupDeadline || initialTime + 2 * 60 * 60000,
            )}
            error={fields.pickupDeadline}
          />
          <p className="field-hint">
            Local timezone. Preparation must be in the past; pickup must be in
            the future and after preparation.
          </p>
          <FormField
            name="pickupLocation"
            label="Pickup location"
            required
            maxLength={500}
            defaultValue={donation?.pickupLocation || ''}
            error={fields.pickupLocation}
          />
        </fieldset>
        <LocationFields
          location={donation?.location}
          disabled={busy}
          error={fields.location}
        />
        <fieldset disabled={busy}>
          <legend>05 · Donation image</legend>
          <p className="donor-upload-intro">
            Optional. Uploads attach after the listing is saved. JPEG, PNG or
            WebP, up to 5 MiB and 20 megapixels. If uploads are unavailable,
            your saved listing remains available.
          </p>
          <div className="form-field">
            <label htmlFor="new-donation-photo">
              Choose a food photo (optional)
            </label>
            <input
              id="new-donation-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            />
          </div>
          <FormField
            name="imageUrl"
            label="Image URL (optional)"
            type="url"
            maxLength={2048}
            readOnly={!!donation?.image}
            defaultValue={donation?.imageUrl || ''}
            hint={
              donation?.image
                ? 'Managed image URLs are kept unchanged. Upload a replacement here, or remove the image from donation details.'
                : 'Alternatively, supply an existing HTTPS image link. Cloudinary credentials stay on the server.'
            }
            error={fields.imageUrl}
          />
        </fieldset>
        {error && (
          <div className="form-alert" role="alert" tabIndex={-1}>
            {error}
            {fields.form && <p>{fields.form}</p>}
          </div>
        )}
        <div className="hero-actions">
          <button className="button" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Publish donation'}
          </button>
          <Link className="text-link" to="/dashboard/donor/donations">
            Back to my donations
          </Link>
        </div>
      </form>
      <aside className="donor-form-guide">
        <Leaf size={31} strokeWidth={1.2} />
        <h2>
          A thoughtful listing
          <br />
          goes a long way.
        </h2>
        <p>
          A clear description helps an organization decide what it can use and
          plan a collection.
        </p>
        <ul>
          <li>Share accurate quantities</li>
          <li>Include storage and allergens</li>
          <li>Allow time for collection</li>
          <li>Keep pickup details current</li>
        </ul>
        <p>
          <Check size={13} /> Your declarations help coordination. They do not
          certify food safety.
        </p>
      </aside>
    </div>
  );
}
export default function DonationFormPage() {
  const { id } = useParams();
  return (
    <section className="workspace-page">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">A little surplus. A new possibility.</span>
          <h1>{id ? 'Edit donation' : 'Create donation'}</h1>
          <p>
            Share clear details so community partners can plan a collection.
          </p>
        </div>
      </div>
      {id ? <EditForm id={id} /> : <DonationForm />}
    </section>
  );
}
function EditForm({ id }) {
  const result = useApiData(`/donations/${id}`);
  return (
    <DataState {...result} retry={result.refresh}>
      {result.data && <DonationForm donation={result.data.donation} />}
    </DataState>
  );
}
