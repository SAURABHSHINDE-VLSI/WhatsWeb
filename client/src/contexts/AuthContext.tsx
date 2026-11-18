import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  User,
  apiGetMe,
  apiGoogleSignIn,
  apiOnboarding,
  apiLogout,
  tryRefreshToken,
  getAccessToken,
  setAccessToken,
} from '../lib/api';
import { wsClient } from '../lib/wsClient';
import { loginWithPasskey } from '../lib/passkeyClient';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  googleSignIn: (idToken: string, nonce: string) => Promise<{ isOnboarded: boolean }>;
  passkeySignIn: (username?: string) => Promise<{ isOnboarded: boolean }>;
  completeOnboarding: (username: string, displayName: string, avatarTint?: number) => Promise<void>;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await apiGetMe();
      if (res?.user) {
        setUser(res.user);
      }
    } catch (err) {
      console.warn('[Auth] Failed to refresh profile', err);
    }
  }, []);

  // Initialize session on page load: silent refresh from httpOnly cookie
  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        const refreshed = await tryRefreshToken();
        if (refreshed && mounted) {
          const res = await apiGetMe();
          if (mounted && res?.user) {
            setUser(res.user);
            const token = getAccessToken();
            if (token) {
              wsClient.connect();
            }
          }
        }
      } catch (err) {
        console.log('[Auth] No active session found');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initSession();

    return () => {
      mounted = false;
    };
  }, []);

  const googleSignIn = async (idToken: string, nonce: string) => {
    setIsLoading(true);
    try {
      const data = await apiGoogleSignIn({ idToken, nonce });
      setUser(data.user);
      wsClient.disconnect();
      if (data.accessToken) {
        wsClient.connect();
      }
      return { isOnboarded: data.isOnboarded };
    } finally {
      setIsLoading(false);
    }
  };

  const passkeySignIn = async (username?: string) => {
    setIsLoading(true);
    try {
      const data = await loginWithPasskey(username);
      setAccessToken(data.accessToken);
      setUser(data.user);
      wsClient.disconnect();
      if (data.accessToken) {
        wsClient.connect();
      }
      return { isOnboarded: data.isOnboarded };
    } finally {
      setIsLoading(false);
    }
  };

  const completeOnboarding = async (username: string, displayName: string, avatarTint?: number) => {
    setIsLoading(true);
    try {
      const data = await apiOnboarding({ username, displayName, avatarTint });
      setUser(data.user);
      wsClient.disconnect();
      if (data.accessToken) {
        wsClient.connect();
      }
    } finally {
      setIsLoading(false);
    }
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
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        googleSignIn,
        passkeySignIn,
        completeOnboarding,
        refreshProfile,
        logout,
      }}
    >
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
