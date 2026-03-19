/**
 * SHIELD API Service Layer
 *
 * Thin wrapper around Axios. All calls go through shield-gateway.
 * Mock data lives in shield-gateway/src/mockData.js — not here.
 *
 * See /FRONTEND_API_CONTRACT.md for the full API specification.
 */

import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT to every outgoing request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('shield_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Unwrap successful responses; handle auth errors
apiClient.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status;
    const isLoginEndpoint = err.config?.url?.includes('/auth/login');

    // On 401 from any endpoint OTHER than login — session expired, force re-login
    if (status === 401 && !isLoginEndpoint) {
      localStorage.removeItem('shield_token');
      localStorage.removeItem('shield_user');
      window.location.href = '/login';
    }

    // Propagate the error so callers can display the message
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────

export const authAPI = {
  login: (credentials) => apiClient.post('/auth/login', credentials),
  logout: () => apiClient.post('/auth/logout').catch(() => {}),
};

// ── Dashboard ─────────────────────────────────────────────────────────────

export const dashboardAPI = {
  getStats: () => apiClient.get('/dashboard/stats'),
};

// ── FIR ───────────────────────────────────────────────────────────────────

export const firAPI = {
  list:   (params) => apiClient.get('/firs', { params }),
  get:    (id) => apiClient.get(`/firs/${id}`),
  upload: (formData) => apiClient.post('/fir/create', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  verify: (id) => apiClient.post(`/firs/${id}/verify`),
  downloadUrl: (id) => `/api/firs/${id}/download`,
};

// ── Evidence ──────────────────────────────────────────────────────────────

export const evidenceAPI = {
  list:   (params) => apiClient.get('/evidence', { params }),
  get:    (id) => apiClient.get(`/evidence/${id}`),
  upload: (formData) => apiClient.post('/evidence', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  verify: (id) => apiClient.post(`/evidence/${id}/verify`),
  downloadUrl: (id) => `/api/evidence/${id}/download`,
};

// ── Audit ─────────────────────────────────────────────────────────────────

export const auditAPI = {
  list: (params) => apiClient.get('/audit', { params }),
};

// ── Admin ─────────────────────────────────────────────────────────────────

export const adminAPI = {
  listUsers:  (params) => apiClient.get('/admin/users', { params }),
  createUser: (data) => apiClient.post('/admin/users', data),
  updateUser: (id, data) => apiClient.patch(`/admin/users/${id}`, data),
};
