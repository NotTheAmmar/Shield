import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Validate identity implicitly by having the backend inspect the HttpOnly cookie
  useEffect(() => {
    let mounted = true;
    const hydrateIdentity = async () => {
      try {
        const { user: serverUser } = await authAPI.getMe();
        if (mounted) setUser(serverUser);
      } catch (err) {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setIsInitializing(false);
      }
    };
    hydrateIdentity();
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async ({ email, password, role }) => {
    const data = await authAPI.login({ email, password, role });
    setUser(data.user); // The HttpOnly dual-cookies are automatically set by the browser
    return data;
  }, []);

  const logout = useCallback(async () => {
    await authAPI.logout(); // Explicitly tells backend to destroy the cookies
    setUser(null);
  }, []);

  const isAuthenticated = Boolean(user);
  const role = user?.role || null;

  const hasRole = useCallback((roles) => {
    if (!role) return false;
    const allowed = Array.isArray(roles) ? roles : [roles];
    return allowed.includes(role);
  }, [role]);

  return (
    <AuthContext.Provider value={{ user, role, isAuthenticated, isInitializing, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
