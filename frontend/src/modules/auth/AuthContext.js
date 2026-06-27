import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BASE_URL = import.meta.env?.VITE_API_BASE_URL + '/api' || 'http://localhost:3001/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(() => localStorage.getItem('erp_token'));
  const [loading, setLoading] = useState(true);

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

  const logout = useCallback(() => {
    localStorage.removeItem('erp_token');
    setToken(null);
    setUser(null);
  }, []);

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