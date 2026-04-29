/**
 * SHIELD API Service Layer — PRODUCTION NGINX VERSION
 * 
 * Secures network transport utilizing Strict Same-Origin HttpOnly cookies.
 * Implements advanced Axios Interceptor Silent Refresh Queue logic to prevent
 * Token Replay invalidation due to React component race conditions.
 */

import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true, // EXPLICITLY REQUIRE COOKIES CROSS-BOUNDARIES
  headers: { 'Content-Type': 'application/json' },
});

// ── Silent Refresh Concurrency Lock ───────────────────────────────────────

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

// Response Interceptor: The execution lock
apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;
    
    if (!originalRequest) return Promise.reject(error);

    const isAuthRoute = originalRequest.url.includes('/auth/login') ||
                        originalRequest.url.includes('/auth/logout') ||
                        originalRequest.url.includes('/auth/refresh') ||
                        originalRequest.url.includes('/auth/change-password');
    const isMeRoute = originalRequest.url.includes('/auth/me');

    // Only intercept 401s that are NOT explicit auth actions
    if (error.response?.status === 401 && !isAuthRoute && !originalRequest._retry) {
      
      if (isRefreshing) {
        // Suspend this request into the failedQueue array
        return new Promise(function(resolve, reject) {
          failedQueue.push({ resolve, reject });
        })
        .then(() => apiClient(originalRequest))
        .catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // SILENT PING: Request a new short-lived cookie using the 7-day refresh cookie
        await axios.post('/api/auth/refresh', {}, { withCredentials: true, baseURL: '' });
        
        // Refresh Success!
        processQueue(null, true);
        isRefreshing = false;
        
        // Retry the original request that triggered the 401
        return apiClient(originalRequest);
        
      } catch (refreshErr) {
        // The refresh token is dead or invalid. Game over.
        processQueue(refreshErr, null);
        isRefreshing = false;
        
        // If this wasn't just a background hydration check, flush the user.
        if (!isMeRoute && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────

export const authAPI = {
  login:          (credentials) => apiClient.post('/auth/login', credentials),
  logout:         () => apiClient.post('/auth/logout').catch(() => {}),
  getMe:          () => apiClient.get('/auth/me').catch(() => { throw new Error('Unauthenticated'); }),
  changePassword: (data) => apiClient.post('/auth/change-password', data),
};

// ── Dashboard ─────────────────────────────────────────────────────────────

export const dashboardAPI = {
  getStats: () => apiClient.get('/dashboard/stats'),
};

// ── FIR ───────────────────────────────────────────────────────────────────

export const firAPI = {
  list:   (params) => apiClient.get('/fir/list', { params }),
  get:    (id) => apiClient.get(`/fir/${id}`),
  upload: (formData) => apiClient.post('/fir/create', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  verify: (id) => apiClient.get(`/evidence/verify/${id}`),
  downloadUrl: (id) => `/api/evidence/download/${id}`,
};

// ── Evidence ──────────────────────────────────────────────────────────────

export const evidenceAPI = {
  list:   (params) => apiClient.get('/evidence', { params }),
  get:    (id) => apiClient.get(`/evidence/${id}`),
  upload: (formData) => apiClient.post('/evidence/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  verify: (id) => apiClient.get(`/evidence/verify/${id}`),
  downloadUrl: (id) => `/api/evidence/download/${id}`,
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

// ── Reports ───────────────────────────────────────────────────────────────

export const reportsAPI = {
  getChainOfCustody: (evidenceId) => apiClient.get(`/reports/chain-of-custody/${evidenceId}`),
  getMetadata:       (evidenceId) => apiClient.get(`/reports/metadata/${evidenceId}`),
  requestPdf:        (evidenceId) => apiClient.post(`/reports/chain-of-custody/${evidenceId}/pdf`),
  getJobStatus:      (jobId) => apiClient.get(`/reports/status/${jobId}`),
};
