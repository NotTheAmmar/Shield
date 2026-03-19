import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

/**
 * Decode the JWT payload (base64 middle segment).
 * Works for both real JWTs and our mock tokens.
 */
function decodeToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    // Convert base64url → standard base64, then pad
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isTokenExpired(decoded) {
  if (!decoded?.exp) return false;
  return decoded.exp < Date.now() / 1000;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('shield_token'));
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('shield_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Validate token on mount
  useEffect(() => {
    if (token) {
      const decoded = decodeToken(token);
      if (!decoded || isTokenExpired(decoded)) {
        localStorage.removeItem('shield_token');
        localStorage.removeItem('shield_user');
        setToken(null);
        setUser(null);
      }
    }
  }, []);

  const login = useCallback(async ({ email, password, role }) => {
    const data = await authAPI.login({ email, password, role });
    localStorage.setItem('shield_token', data.token);
    localStorage.setItem('shield_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await authAPI.logout();
    localStorage.removeItem('shield_token');
    localStorage.removeItem('shield_user');
    setToken(null);
    setUser(null);
  }, []);

  const isAuthenticated = Boolean(token && user);
  const role = user?.role || null;

  const hasRole = useCallback((roles) => {
    if (!role) return false;
    const allowed = Array.isArray(roles) ? roles : [roles];
    return allowed.includes(role);
  }, [role]);

  return (
    <AuthContext.Provider value={{ user, token, role, isAuthenticated, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
