import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const BASE_URL = import.meta.env?.VITE_API_BASE_URL + '/api' || 'http://localhost:3001/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(() => localStorage.getItem('erp_token'));
  const [loading, setLoading] = useState(true); // checking stored token on mount

  // On mount — if a token is in localStorage, verify it with /api/auth/me
  useEffect(() => {
    if (!token) { setLoading(false); return; }

    axios.get(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        try { console.log('AUTH ME:', r.data); } catch (e) {}
        setUser(r.data);
      })
      .catch(() => {
        // token invalid or expired — clear it
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
  
  const changePassword = useCallback(
  async ({ currentPassword, newPassword }) => {
    const { data } = await axios.post(
      `${BASE_URL}/auth/change-password`,
      {
        currentPassword,
        newPassword,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    return data;
  },
  [token]
);

  const logout = useCallback(() => {
    localStorage.removeItem('erp_token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout,  changePassword, }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}