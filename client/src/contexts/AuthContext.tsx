import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiGetMe, apiLogin, apiRegister, apiLogout, setAccessToken, getAccessToken } from '../lib/api';
import { wsClient } from '../lib/wsClient';

export interface User {
  id: string;
  username: string;
  displayName: string;
  phoneNumber?: string;
  avatarTint: number;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password?: string) => Promise<void>;
  register: (payload: { username: string; password?: string; displayName: string; phoneNumber?: string; avatarTint?: number }) => Promise<void>;
  switchUser: (username: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize session or auto-login default demo user 'alex'
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const token = getAccessToken();
        if (token) {
          const res = await apiGetMe();
          if (mounted && res?.user) {
            setUser(res.user);
            wsClient.connect(token);
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.log('[Auth] Token check failed, attempting auto-login as alex...');
      }

      // Default quick-start login as Alex Mercer
      try {
        const data = await apiLogin('alex', 'password123');
        if (mounted && data?.user) {
          setUser(data.user);
          wsClient.connect(data.accessToken);
        }
      } catch (err) {
        console.warn('[Auth] Auto-login failed', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (username: string, password = 'password123') => {
    setIsLoading(true);
    try {
      const data = await apiLogin(username, password);
      setUser(data.user);
      wsClient.disconnect();
      wsClient.connect(data.accessToken);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (payload: { username: string; password?: string; displayName: string; phoneNumber?: string; avatarTint?: number }) => {
    setIsLoading(true);
    try {
      const data = await apiRegister({
        username: payload.username,
        password: payload.password || 'password123',
        displayName: payload.displayName,
        phoneNumber: payload.phoneNumber,
        avatarTint: payload.avatarTint,
      });
      setUser(data.user);
      wsClient.disconnect();
      wsClient.connect(data.accessToken);
    } finally {
      setIsLoading(false);
    }
  };

  const switchUser = async (username: string) => {
    await login(username, 'password123');
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      wsClient.disconnect();
      await apiLogout();
      setUser(null);
      setAccessToken(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, switchUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
