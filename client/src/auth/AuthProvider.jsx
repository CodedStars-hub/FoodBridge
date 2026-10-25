import { useEffect, useState } from 'react';
import { AuthContext } from './AuthContext.js';
import { api } from '../utils/api.js';
async function readSession(signal) {
  try {
    const { user } = await api('/auth/me', { signal });
    return { user, status: 'authenticated', error: '' };
  } catch (error) {
    return {
      user: null,
      status: error.status === 401 ? 'anonymous' : 'error',
      error:
        error.status === 401
          ? ''
          : 'We couldn’t restore your session. Check your connection and try again.',
    };
  }
}
export default function AuthProvider({ children }) {
  const [session, setSession] = useState({
    user: null,
    status: 'loading',
    error: '',
  });
  useEffect(() => {
    const controller = new AbortController();
    readSession(controller.signal).then((next) => {
      if (!controller.signal.aborted) setSession(next);
    });
    return () => controller.abort();
  }, []);
  async function authenticate(action, input) {
    const { user } = await api(`/auth/${action}`, {
      method: 'POST',
      body: input,
    });
    setSession({ user, status: 'authenticated', error: '' });
    return user;
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (error) {
      if (error.status !== 401) throw error;
    }
    setSession({ user: null, status: 'anonymous', error: '' });
  }
  async function updateProfile(input) {
    try {
      const { user } = await api('/users/me', { method: 'PATCH', body: input });
      setSession({ user, status: 'authenticated', error: '' });
      return user;
    } catch (error) {
      if (error.status === 401)
        setSession({ user: null, status: 'anonymous', error: '' });
      throw error;
    }
  }
  async function retry() {
    setSession({ user: null, status: 'loading', error: '' });
    setSession(await readSession());
  }
  return (
    <AuthContext.Provider
      value={{ ...session, authenticate, logout, updateProfile, retry }}
    >
      {children}
    </AuthContext.Provider>
  );
}
