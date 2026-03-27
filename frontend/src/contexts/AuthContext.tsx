import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe } from '../services/api';

interface AuthState {
  token: string | null;
  userId: string | null;
  balance: number;
  isAuthenticated: boolean;
  loading: boolean;
}

interface AuthContextType extends AuthState {
  login: (token: string) => void;
  logout: () => void;
  refreshBalance: () => Promise<void>;
  setBalance: (balance: number) => void;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: localStorage.getItem('token'),
    userId: null,
    balance: 0,
    isAuthenticated: false,
    loading: true,
  });

  const login = useCallback((token: string) => {
    localStorage.setItem('token', token);
    setState(s => ({ ...s, token, isAuthenticated: true }));
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setState({ token: null, userId: null, balance: 0, isAuthenticated: false, loading: false });
  }, []);

  const refreshBalance = useCallback(async () => {
    try {
      const data = await getMe();
      setState(s => ({ ...s, userId: data.userId, balance: data.balance }));
    } catch {
      logout();
    }
  }, [logout]);

  const setBalance = useCallback((balance: number) => {
    setState(s => ({ ...s, balance }));
  }, []);

  useEffect(() => {
    if (state.token) {
      getMe()
        .then(data => {
          setState(s => ({
            ...s,
            userId: data.userId,
            balance: data.balance,
            isAuthenticated: true,
            loading: false,
          }));
        })
        .catch(() => {
          logout();
          setState(s => ({ ...s, loading: false }));
        });
    } else {
      setState(s => ({ ...s, loading: false }));
    }
  }, [state.token, logout]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshBalance, setBalance }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
