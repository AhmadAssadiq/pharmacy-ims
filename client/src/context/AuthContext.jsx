import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { loadAuth, saveAuth } from '../api/client';
import { loginRequest, meRequest, registerRequest } from '../api/auth';

const AuthContext = createContext(null);

/**
 * Holds the signed-in user and token, persists them in localStorage and
 * exposes login / register / logout to the rest of the app.
 *
 * The stored user is refreshed from /auth/me once on load, so details added
 * since sign-in (a phone number, a changed name) are current; updateUser
 * replaces it after the user edits their own details.
 */
export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => loadAuth());

  const applyAuth = useCallback((next) => {
    saveAuth(next);
    setAuth(next);
  }, []);

  const login = useCallback(async (credentials) => {
    const result = await loginRequest(credentials);
    applyAuth(result);
    return result.user;
  }, [applyAuth]);

  const register = useCallback(async (payload) => {
    const result = await registerRequest(payload);
    applyAuth(result);
    return result.user;
  }, [applyAuth]);

  const logout = useCallback(() => applyAuth(null), [applyAuth]);

  const updateUser = useCallback((user) => {
    setAuth((prev) => {
      if (!prev) return prev;
      const next = { ...prev, user };
      saveAuth(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!loadAuth()?.token) return;
    meRequest()
      .then(({ user }) => updateUser(user))
      .catch(() => {}); // a rejected token signs out through the event below
  }, [updateUser]);

  // The API client fires this event when the server rejects the token.
  useEffect(() => {
    window.addEventListener('pims:unauthorized', logout);
    return () => window.removeEventListener('pims:unauthorized', logout);
  }, [logout]);

  const value = useMemo(
    () => ({ user: auth?.user || null, token: auth?.token || null, login, register, logout, updateUser }),
    [auth, login, register, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
