import { useRef, useState } from 'react';
import { api } from '../utils/api.js';
import { ConfirmAction } from './DonationShared.jsx';
export default function DonationImageManager({ donation, config, refresh }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);
  if (!config) return null;
  async function upload(event) {
    event.preventDefault();
    setError('');
    if (!file) return;
    if (!config.supportedFormats.includes(file.type)) {
      setError('Choose a JPEG, PNG or WebP image');
      return;
    }
    if (file.size > config.maxBytes) {
      setError('Image must be at most 5 MiB');
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      await api(`/donations/${donation._id}/image`, { method: 'POST', body });
      setFile(null);
      if (input.current) input.current.value = '';
      refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="image-manager profile-card">
      <h2>Donation image</h2>
      {!config.enabled ? (
        <p className="notice-panel">
          Image uploads are not configured. Your donation and reservation
          workflows remain available.
        </p>
      ) : (
        <>
          <p>
            JPEG, PNG or WebP · up to 5 MiB and 20 megapixels. Images are
            re-encoded and location metadata is removed.
          </p>
          <form aria-label="Donation image upload" onSubmit={upload}>
            <label htmlFor="donation-image">Choose a food photo</label>
            <input
              ref={input}
              id="donation-image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                setError('');
              }}
            />
            <button className="button" disabled={busy || !file}>
              {busy
                ? 'Uploading…'
                : donation.image
                  ? 'Replace image'
                  : 'Upload image'}
            </button>
          </form>
          {(donation.image || donation.imageUrl) && (
            <ConfirmAction
              label="Remove image"
              description="Remove this donation’s image. Managed cloud assets are deleted or queued for retryable cleanup; food inventory stays unchanged."
              disabled={busy}
              onConfirm={async () => {
                await api(`/donations/${donation._id}/image`, {
                  method: 'DELETE',
                });
                refresh();
              }}
            />
          )}
        </>
      )}
      {error && (
        <p className="form-alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
