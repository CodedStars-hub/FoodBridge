import { useState } from 'react';
import { useApiData } from '../hooks/useApiData.js';
import { api } from '../utils/api.js';
import {
  DataState,
  Pagination,
  StatusBadge,
} from '../components/DonationShared.jsx';
export default function AdminVerifications() {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const result = useApiData(
    `/admin/verifications?status=${status}&page=${page}`,
  );
  async function review(user, next) {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/verifications/${user._id}`, {
        method: 'PATCH',
        body: { status: next, previousStatus: user.verificationStatus },
      });
      result.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace-page">
      <div className="workspace-title">
        <div>
          <h1>Account verification</h1>
          <p>
            Review NGO and volunteer identity and eligibility with the account
            holder before approving. Contact details are supplied by users and
            are not proof of eligibility.
          </p>
        </div>
      </div>
      <label>
        Verification status{' '}
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {['pending', 'verified', 'rejected'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <button className="button button-outline" onClick={result.refresh}>
        Refresh accounts
      </button>
      {error && <p role="alert">{error}</p>}
      <DataState {...result} retry={result.refresh}>
        {result.data?.items.length === 0 && (
          <p>No {status} NGO or volunteer accounts.</p>
        )}
        {result.data?.items.map((user) => (
          <article className="profile-card" key={user._id}>
            <h2>{user.name}</h2>
            <p>
              {user.role} · {user.organizationName}
            </p>
            <p>
              {user.email} · {user.phone || 'No phone provided'}
            </p>
            <StatusBadge status={user.verificationStatus} />
            {['verified', 'rejected']
              .filter((s) => s !== user.verificationStatus)
              .map((s) => (
                <button
                  className="button button-outline"
                  disabled={busy}
                  key={s}
                  onClick={() => review(user, s)}
                >
                  {s === 'verified' ? 'Approve' : 'Reject'} {user.name}
                </button>
              ))}
          </article>
        ))}
        <Pagination pagination={result.data?.pagination} onPage={setPage} />
      </DataState>
    </section>
  );
}
