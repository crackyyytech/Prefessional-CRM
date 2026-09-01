import { createContext, useContext, useEffect, useState } from 'react';
import { api, clearToken, getToken, setToken } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    api.me()
      .then((data) => {
        setUser(data.user);
        setPermissions(data.permissions || []);
      })
      .catch(() => {
        clearToken();
        setUser(null);
        setPermissions([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const interval = setInterval(() => {
      api.me()
        .then((data) => {
          setUser(data.user);
          setPermissions(data.permissions || []);
        })
        .catch(() => {
          clearToken();
          setUser(null);
          setPermissions([]);
        });
    }, 45000);

    return () => clearInterval(interval);
  }, [user]);

  const login = async (email, password) => {
    const data = await api.login({ email, password });
    setToken(data.token);
    setUser(data.user);
    setPermissions(data.permissions || []);
    return data;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore — clear local session anyway
    }
    clearToken();
    setUser(null);
    setPermissions([]);
  };

  const updateProfile = async (payload) => {
    const data = await api.updateProfile(payload);
    setUser(data.user);
    setPermissions(data.permissions || []);
    return data;
  };

  const can = (permission) => permissions.includes(permission);

  const canAny = (...perms) => perms.some((p) => permissions.includes(p));

  return (
    <AuthContext.Provider value={{ user, permissions, loading, login, logout, updateProfile, can, canAny }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
