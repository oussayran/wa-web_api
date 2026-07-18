import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, api, rememberCsrfToken } from '../lib/api';
import type { Admin } from '../types';

interface AuthContextValue {
  admin: Admin | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.me()
      .then(({ admin: authenticatedAdmin }) => {
        if (active) setAdmin(authenticatedAdmin);
      })
      .catch((error: unknown) => {
        if (active && (!(error instanceof ApiError) || error.status !== 401)) {
          setAdmin(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function login(email: string, password: string) {
    const result = await api.login(email, password);
    rememberCsrfToken(result.csrfToken);
    setAdmin(result.admin);
  }

  async function logout() {
    await api.logout();
    rememberCsrfToken(null);
    setAdmin(null);
  }

  return <AuthContext.Provider value={{ admin, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}
