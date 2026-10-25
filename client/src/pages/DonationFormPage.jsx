import LocationFields from '../components/LocationFields.jsx';
import { locationInput } from '../utils/location.js';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const editing = !!donation;
  const [initialTime] = useState(() => Date.now());
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    const input = Object.fromEntries(new FormData(event.currentTarget));
    input.quantity = Number(input.quantity);
    input.preparationTime = new Date(input.preparationTime).toISOString();
    input.pickupDeadline = new Date(input.pickupDeadline).toISOString();
    try {
      locationInput(input, donation || {});
      const data = await api(
        editing ? `/donations/${donation._id}` : '/donations',
        { method: editing ? 'PATCH' : 'POST', body: input },
      );
      navigate(`/dashboard/donor/donations/${data.donation._id}`);
    } catch (failure) {
      setError(failure.message);
      setFields(failure.fields || {});
    } finally {
      setBusy(false);
    }
  }
  const declarations = [
    ['storageConditions', 'Storage conditions', 500],
    ['packagingDetails', 'Packaging details', 500],
    ['handlingDetails', 'Handling details', 500],
    ['allergenInformation', 'Allergen information', 500],
    ['pickupLocation', 'Pickup location', 500],
  ];
  return (
    <form
      className="donation-form profile-card"
      onSubmit={submit}
      aria-label={editing ? 'Edit donation' : 'Create donation'}
    >
      <fieldset disabled={busy}>
        <legend>Food and quantity</legend>
        <FormField
          name="title"
          label="Donation title"
          required
          maxLength={120}
          defaultValue={donation?.title || ''}
          error={fields.title}
        />
        <div className="profile-fields">
          <div className="form-field">
            <label htmlFor="category">Food category</label>
            <select
              id="category"
              name="category"
              defaultValue={donation?.category || categoryOptions[0]}
            >
              {categoryOptions.map((value) => (
                <option key={value} value={value}>
                  {readable(value)}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label htmlFor="unit">Quantity unit</label>
            <select
              id="unit"
              name="unit"
              defaultValue={donation?.unit || 'servings'}
            >
              {unitOptions.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
        </div>
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
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Collection window</legend>
        <div className="profile-fields">
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
        </div>
        <p className="field-hint">
          Times are entered in your local timezone. Preparation must be in the
          past; pickup must be in the future.
        </p>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Donor declarations</legend>
        <p className="declaration-note">
          Describe what you know about the food. These details are not a food
          safety certification. For allergens, explicitly state known allergens
          or that information is unknown.
        </p>
        {declarations.map(([name, label, max]) => (
          <FormField
            key={name}
            name={name}
            label={label}
            required
            maxLength={max}
            defaultValue={donation?.[name] || ''}
            error={fields[name]}
          />
        ))}
        <FormField
          name="imageUrl"
          label="Image URL (optional)"
          type="url"
          maxLength={2048}
          defaultValue={donation?.imageUrl || ''}
          hint="An existing HTTPS image link. No uploads or external image service is required."
          error={fields.imageUrl}
        />
      </fieldset>
      <LocationFields
        location={donation?.location}
        disabled={busy}
        error={fields.location}
      />
      {error && (
        <div className="form-alert" role="alert">
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
  );
}
export default function DonationFormPage() {
  const { id } = useParams();
  return (
    <section className="workspace-page">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">MAKE GOOD GO FURTHER</span>
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
