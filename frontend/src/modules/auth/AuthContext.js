import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

// (import.meta.env?.VITE_API_BASE_URL || '') + '/api' — NOT
// `VITE_API_BASE_URL + '/api' || fallback`. `+` binds tighter than `||`, so
// the old form evaluated as `(VITE_API_BASE_URL + '/api') || fallback`:
// when the env var is unset, `undefined + '/api'` is the STRING
// "undefined/api" (truthy), so the `|| fallback` never actually ran — every
// request would have hit the literal path "undefined/api/...". Falls back
// to '' (relative, via Vite's dev proxy — see vite.config.js) rather than a
// hardcoded 'http://localhost:3001', which only works for whoever's running
// the dev server locally; anyone else on the LAN hitting this host's own IP
// needs same-origin relative requests, not a literal "localhost".
const BASE_URL = (import.meta.env?.VITE_API_BASE_URL || '') + '/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(() => localStorage.getItem('erp_token'));
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // On mount — if a token is in localStorage, verify it with /api/auth/me
  useEffect(() => {
    if (!token) { setLoading(false); return; }

    axios.get(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        setUser(r.data);
      })
      .catch(() => {
        localStorage.removeItem('erp_token');
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []); // only on mount

  const login = useCallback(async ({ username, password }) => {
    const { data } = await axios.post(`${BASE_URL}/auth/login`, { username, password });
    localStorage.setItem('erp_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const changePassword = useCallback(async ({ currentPassword, newPassword }) => {
    const { data } = await axios.post(
      `${BASE_URL}/auth/change-password`,
      { currentPassword, newPassword },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return data;
  }, [token]);

  // Forced first-login flow — no currentPassword needed
  const setInitialPassword = useCallback(async ({ newPassword }) => {
    const { data } = await axios.post(
      `${BASE_URL}/auth/set-initial-password`,
      { newPassword },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return data;
  }, [token]);

  /**
   * Forgot password — public, no token required.
   * Sends a reset email to the given address if an active account is found.
   * Always resolves (even if the email is not registered) to avoid revealing
   * whether an account exists.
   */
  const forgotPassword = useCallback(async (email) => {
    const { data } = await axios.post(`${BASE_URL}/auth/forgot-password`, { email });
    return data;
  }, []);

  // Now that navigation is real URL state (see App.js/AppShell.js's router
  // migration), the URL itself outlives whoever's logged in — without this,
  // logging out and logging back in as a different account resumed at
  // whatever path the previous account had left open (e.g. a specific
  // project), since nothing ever cleared it. Reset to '/' on the way out so
  // every fresh login starts from Home regardless of where the last session
  // was sitting.
  const logout = useCallback(() => {
    localStorage.removeItem('erp_token');
    setToken(null);
    setUser(null);
    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <AuthContext.Provider value={{
      user, token, loading,
      login, logout,
      changePassword, setInitialPassword,
      forgotPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}