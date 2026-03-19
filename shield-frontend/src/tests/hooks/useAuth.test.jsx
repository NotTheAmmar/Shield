import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '../../hooks/useAuth';

// Mock the api module
vi.mock('../../services/api', () => ({
  authAPI: {
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

import { authAPI } from '../../services/api';

const MOCK_USER = {
  id: 'usr_001',
  name: 'Rajesh Kumar',
  email: 'rajesh@police.gov.in',
  role: 'police_officer',
  employeeId: 'MH/INS/2041',
};

// Create a simple mock JWT: header.payload.signature
// payload must be base64(JSON) with exp in the future
function makeMockToken(overrides = {}) {
  const payload = { userId: 'usr_001', role: 'police_officer', exp: Math.floor(Date.now() / 1000) + 86400, ...overrides };
  return `mock.${btoa(JSON.stringify(payload))}.sig`;
}

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('starts unauthenticated when no token in localStorage', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it('restores session from localStorage on mount', () => {
    localStorage.setItem('shield_token', makeMockToken());
    localStorage.setItem('shield_user', JSON.stringify(MOCK_USER));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.name).toBe('Rajesh Kumar');
    expect(result.current.role).toBe('police_officer');
  });

  it('login stores token and user, sets isAuthenticated=true', async () => {
    const token = makeMockToken();
    authAPI.login.mockResolvedValue({ token, user: MOCK_USER });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.login({ email: 'rajesh@police.gov.in', password: 'pw', role: 'police_officer' });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.role).toBe('police_officer');
    expect(localStorage.getItem('shield_token')).toBe(token);
    expect(JSON.parse(localStorage.getItem('shield_user'))?.name).toBe('Rajesh Kumar');
  });

  it('logout clears token, user, and isAuthenticated', async () => {
    localStorage.setItem('shield_token', makeMockToken());
    localStorage.setItem('shield_user', JSON.stringify(MOCK_USER));
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('shield_token')).toBeNull();
  });

  it('hasRole returns true for matching role', () => {
    localStorage.setItem('shield_token', makeMockToken({ role: 'admin' }));
    localStorage.setItem('shield_user', JSON.stringify({ ...MOCK_USER, role: 'admin' }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.hasRole(['admin'])).toBe(true);
    expect(result.current.hasRole(['police_officer'])).toBe(false);
  });

  it('clears expired token on mount', () => {
    localStorage.setItem('shield_token', makeMockToken({ exp: Math.floor(Date.now() / 1000) - 1 }));
    localStorage.setItem('shield_user', JSON.stringify(MOCK_USER));
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('shield_token')).toBeNull();
  });

  it('throws when used outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within AuthProvider');
  });
});
