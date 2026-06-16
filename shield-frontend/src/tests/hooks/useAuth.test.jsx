import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '../../hooks/useAuth';

// Mock the api module
vi.mock('../../services/api', () => ({
  authAPI: {
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    getMe: vi.fn(),
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

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts unauthenticated when getMe fails', async () => {
    authAPI.getMe.mockRejectedValue(new Error('Unauthenticated'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await waitFor(() => expect(result.current.isInitializing).toBe(false));
    
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it('restores session from getMe on mount', async () => {
    authAPI.getMe.mockResolvedValue({ user: MOCK_USER });
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await waitFor(() => expect(result.current.isInitializing).toBe(false));
    
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.name).toBe('Rajesh Kumar');
    expect(result.current.role).toBe('police_officer');
  });

  it('login stores user and sets isAuthenticated=true', async () => {
    authAPI.getMe.mockRejectedValue(new Error('Unauthenticated'));
    authAPI.login.mockResolvedValue({ user: MOCK_USER });
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    await act(async () => {
      await result.current.login({ email: 'rajesh@police.gov.in', password: 'pw', role: 'police_officer' });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.role).toBe('police_officer');
    expect(result.current.user?.name).toBe('Rajesh Kumar');
  });

  it('logout clears user and isAuthenticated', async () => {
    authAPI.getMe.mockResolvedValue({ user: MOCK_USER });
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await waitFor(() => expect(result.current.isInitializing).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('hasRole returns true for matching role', async () => {
    authAPI.getMe.mockResolvedValue({ user: { ...MOCK_USER, role: 'admin' } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    await waitFor(() => expect(result.current.isInitializing).toBe(false));
    
    expect(result.current.hasRole(['admin'])).toBe(true);
    expect(result.current.hasRole(['police_officer'])).toBe(false);
  });

  it('throws when used outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within AuthProvider');
  });
});
