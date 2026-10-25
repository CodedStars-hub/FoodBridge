import { useAuth } from '../auth/useAuth.js';
export default function SessionState() {
  const { status, error, retry } = useAuth();
  return (
    <section className="session-state container" aria-live="polite">
      {status === 'loading' ? (
        <p role="status">Restoring your session…</p>
      ) : (
        <>
          <p role="alert">{error}</p>
          <button className="button" onClick={retry}>
            Try again
          </button>
        </>
      )}
    </section>
  );
}
