// Who is signed in. Any component can read it with:
//   const { user, login, logout } = useAuth();
//
// The user and their login token are saved in localStorage, so a page refresh keeps you
// signed in. When the app opens, the user's details are refreshed from the server once
// (so a phone number added since the last login shows up).
import { createContext, useContext, useEffect, useState } from 'react';
import { loadAuth, saveAuth } from '../api/client';
import { loginRequest, meRequest, registerRequest } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // { user, token } while signed in, null when signed out
  const [auth, setAuth] = useState(loadAuth);

  // Saves the new sign-in state (or null to sign out) and updates the app
  function changeAuth(newAuth) {
    saveAuth(newAuth);
    setAuth(newAuth);
  }

  // Signs in with { email, password }. Returns the user.
  async function login(credentials) {
    const result = await loginRequest(credentials);
    changeAuth(result);
    return result.user;
  }

  // Creates a patient account and signs in. Returns the user.
  async function register(details) {
    const result = await registerRequest(details);
    changeAuth(result);
    return result.user;
  }

  function logout() {
    changeAuth(null);
  }

  // Replaces the saved user (after they change their own details), keeping the same token
  function updateUser(user) {
    const saved = loadAuth();
    if (saved) {
      changeAuth({ ...saved, user });
    }
  }

  // When the app opens: refresh the user's details from the server
  useEffect(() => {
    if (!loadAuth()) {
      return;
    }
    meRequest()
      .then((result) => updateUser(result.user))
      .catch(() => {}); // an invalid token signs out through the event below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // api/client.js fires 'pims:unauthorized' when the server rejects the login token:
  // sign out then
  useEffect(() => {
    function handleUnauthorized() {
      changeAuth(null);
    }
    window.addEventListener('pims:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('pims:unauthorized', handleUnauthorized);
  }, []);

  const value = {
    user: auth ? auth.user : null,
    token: auth ? auth.token : null,
    login,
    register,
    logout,
    updateUser,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Reads the sign-in state from any component inside <AuthProvider>
export function useAuth() {
  return useContext(AuthContext);
}
