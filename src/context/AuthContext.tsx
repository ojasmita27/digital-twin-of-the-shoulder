/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, LoginResponse } from '../types/auth';
import { apiClient } from '../services/apiClient';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<{ success: boolean; resetToken?: string; message: string; error?: string }>;
  resetPassword: (resetToken: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
}

const AUTH_STORAGE_KEY = 'shouldertwin_auth_session';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.token && parsed.user ? parsed.user : null;
      }
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    return null;
  });

  const [token, setToken] = useState<string | null>(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return typeof parsed.token === 'string' && parsed.token ? parsed.token : null;
      }
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    apiClient.setUnauthorizedHandler(() => {
      setUser(null);
      setToken(null);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      apiClient.updateConfig({ apiKey: '' });
    });

    return () => apiClient.setUnauthorizedHandler(null);
  }, []);

  // Sync token to apiClient headers
  useEffect(() => {
    if (token) {
      apiClient.updateConfig({ apiKey: token });
    } else {
      apiClient.updateConfig({ apiKey: '' });
    }
  }, [token]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const baseUrl = apiClient.getConfig().baseUrl.trim().replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        setIsLoading(false);
        return {
          success: false,
          error: errJson.detail || `Authentication failed (HTTP ${res.status})`,
        };
      }

      const data: LoginResponse = await res.json();
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: data.token, user: data.user }));
      apiClient.updateConfig({ apiKey: data.token });
      setIsLoading(false);
      return { success: true };
    } catch (err) {
      setIsLoading(false);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Login network failure. Check backend connection.',
      };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      const baseUrl = apiClient.getConfig().baseUrl.trim().replace(/\/+$/, '');
      if (token) {
        await fetch(`${baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }).catch(() => {});
      }
    } finally {
      setUser(null);
      setToken(null);
      localStorage.removeItem(AUTH_STORAGE_KEY);
      apiClient.updateConfig({ apiKey: '' });
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      const baseUrl = apiClient.getConfig().baseUrl.trim().replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      return {
        success: res.ok,
        resetToken: data.resetToken,
        message: data.message || 'If an account exists, a reset token was registered.',
      };
    } catch {
      return {
        success: false,
        message: 'Password reset is unavailable while the backend is disconnected.',
        error: 'Connection error during password reset request.',
      };
    }
  };

  const resetPassword = async (resetToken: string, newPassword: string) => {
    try {
      const baseUrl = apiClient.getConfig().baseUrl.trim().replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.detail || 'Reset failed' };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: 'Connection error during password reset.' };
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      const baseUrl = apiClient.getConfig().baseUrl.trim().replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.detail || 'Password change failed' };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: 'Connection error during password change.' };
    }
  };

  // Verify active session on mount
  useEffect(() => {
    if (token) {
      refreshProfile();
    }
  }, []);

  const refreshProfile = async () => {
    if (!token) return;
    try {
      const baseUrl = apiClient.getConfig().baseUrl.trim().replace(/\/+$/, '');
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const profile: UserProfile = await res.json();
        setUser(profile);
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user: profile }));
      } else if (res.status === 401 || res.status === 403) {
        // Session token expired or invalidated: purge local session
        setUser(null);
        setToken(null);
        localStorage.removeItem(AUTH_STORAGE_KEY);
        apiClient.updateConfig({ apiKey: '' });
      }
    } catch {
      // Network unreachable, preserve offline state
    }
  };


  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        login,
        logout,
        forgotPassword,
        resetPassword,
        changePassword,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
