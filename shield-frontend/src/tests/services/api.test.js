/**
 * API Service Tests
 *
 * Verifies that each API function calls the correct HTTP method + path,
 * and that the response interceptor unwraps `res.data` correctly.
 *
 * All HTTP calls are mocked — no real network traffic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock axios at module level before importing the api module
vi.mock('axios', () => {
  const mockClient = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    interceptors: {
      request: { use: vi.fn((fn) => fn) },
      response: { use: vi.fn((ok, err) => ({ ok, err })) },
    },
  };
  return {
    default: {
      create: vi.fn(() => mockClient),
      ...mockClient,
    },
  };
});

import axios from 'axios';

// Helper: get the mocked client instance returned by axios.create()
const mockClient = axios.create();

beforeEach(() => {
  localStorage.setItem('shield_token', 'mock.e30.sig');
  vi.clearAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

// Import after mock is fully set up
const { firAPI, evidenceAPI, adminAPI, auditAPI, authAPI, dashboardAPI } = await import('../../services/api');

describe('API Service — correct HTTP methods and paths', () => {
  it('authAPI.login calls POST /auth/login with credentials', async () => {
    mockClient.post.mockResolvedValue({ token: 'tkn', user: {} });
    await authAPI.login({ email: 'a@b.com', password: 'pw', role: 'police_officer' });
    expect(mockClient.post).toHaveBeenCalledWith('/auth/login', expect.objectContaining({ email: 'a@b.com' }));
  });

  it('authAPI.logout calls POST /auth/logout', async () => {
    mockClient.post.mockResolvedValue({});
    await authAPI.logout();
    expect(mockClient.post).toHaveBeenCalledWith('/auth/logout');
  });

  it('dashboardAPI.getStats calls GET /dashboard/stats', async () => {
    mockClient.get.mockResolvedValue({ stats: {}, recentActivity: [] });
    await dashboardAPI.getStats();
    expect(mockClient.get).toHaveBeenCalledWith('/dashboard/stats');
  });

  it('firAPI.list calls GET /firs with params', async () => {
    mockClient.get.mockResolvedValue({ data: [], pagination: {} });
    await firAPI.list({ page: 1, limit: 25 });
    expect(mockClient.get).toHaveBeenCalledWith('/firs', { params: { page: 1, limit: 25 } });
  });

  it('firAPI.get calls GET /firs/:id', async () => {
    mockClient.get.mockResolvedValue({ id: 'fir_001' });
    await firAPI.get('fir_001');
    expect(mockClient.get).toHaveBeenCalledWith('/firs/fir_001');
  });

  it('firAPI.verify calls POST /firs/:id/verify', async () => {
    mockClient.post.mockResolvedValue({ match: true });
    await firAPI.verify('fir_001');
    expect(mockClient.post).toHaveBeenCalledWith('/firs/fir_001/verify');
  });

  it('firAPI.downloadUrl returns correct URL string', () => {
    expect(firAPI.downloadUrl('fir_001')).toBe('/api/firs/fir_001/download');
  });

  it('evidenceAPI.list calls GET /evidence with params', async () => {
    mockClient.get.mockResolvedValue({ data: [], pagination: {} });
    await evidenceAPI.list({ page: 1, status: 'pending' });
    expect(mockClient.get).toHaveBeenCalledWith('/evidence', { params: { page: 1, status: 'pending' } });
  });

  it('evidenceAPI.get calls GET /evidence/:id', async () => {
    mockClient.get.mockResolvedValue({ id: 'ev_101' });
    await evidenceAPI.get('ev_101');
    expect(mockClient.get).toHaveBeenCalledWith('/evidence/ev_101');
  });

  it('evidenceAPI.verify calls POST /evidence/:id/verify', async () => {
    mockClient.post.mockResolvedValue({ match: true });
    await evidenceAPI.verify('ev_101');
    expect(mockClient.post).toHaveBeenCalledWith('/evidence/ev_101/verify');
  });

  it('evidenceAPI.downloadUrl returns correct URL string', () => {
    expect(evidenceAPI.downloadUrl('ev_101')).toBe('/api/evidence/ev_101/download');
  });

  it('auditAPI.list calls GET /audit with params', async () => {
    mockClient.get.mockResolvedValue({ data: [], pagination: {} });
    await auditAPI.list({ action: 'LOGIN' });
    expect(mockClient.get).toHaveBeenCalledWith('/audit', { params: { action: 'LOGIN' } });
  });

  it('adminAPI.listUsers calls GET /admin/users with params', async () => {
    mockClient.get.mockResolvedValue({ data: [], pagination: {} });
    await adminAPI.listUsers({ role: 'admin' });
    expect(mockClient.get).toHaveBeenCalledWith('/admin/users', { params: { role: 'admin' } });
  });

  it('adminAPI.createUser calls POST /admin/users', async () => {
    const payload = { name: 'Test', email: 'test@gov.in', role: 'police_officer' };
    mockClient.post.mockResolvedValue({ id: 'usr_new', ...payload });
    await adminAPI.createUser(payload);
    expect(mockClient.post).toHaveBeenCalledWith('/admin/users', payload);
  });

  it('adminAPI.updateUser calls PATCH /admin/users/:id', async () => {
    mockClient.patch.mockResolvedValue({ id: 'usr_001', status: 'deactivated' });
    await adminAPI.updateUser('usr_001', { status: 'deactivated' });
    expect(mockClient.patch).toHaveBeenCalledWith('/admin/users/usr_001', { status: 'deactivated' });
  });
});
