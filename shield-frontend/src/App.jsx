import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import ProtectedRoute from './components/ProtectedRoute';
import NavBar from './components/NavBar';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import FirRegistryPage from './pages/FirRegistryPage';
import FirDetailPage from './pages/FirDetailPage';
import VaultPage from './pages/VaultPage';
import EvidenceDetailPage from './pages/EvidenceDetailPage';
import AuditLogPage from './pages/AuditLogPage';
import AdminUsersPage from './pages/AdminUsersPage';

function AppLayout({ children }) {
  return (
    <div className="app-layout">
      <NavBar />
      <main className="page-content">
        {children}
      </main>
      <footer className="footer">
        © 2026 SHIELD · Secure Hash-based Immutable Evidence Locker &amp; Database
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected: All authenticated roles */}
            <Route
              path="/"
              element={
                <ProtectedRoute roles={['police_officer', 'judicial_authority', 'admin']}>
                  <AppLayout><DashboardPage /></AppLayout>
                </ProtectedRoute>
              }
            />

            {/* Police only */}
            <Route
              path="/upload"
              element={
                <ProtectedRoute roles={['police_officer']}>
                  <AppLayout><UploadPage /></AppLayout>
                </ProtectedRoute>
              }
            />

            {/* Police + Judicial */}
            <Route
              path="/fir"
              element={
                <ProtectedRoute roles={['police_officer', 'judicial_authority']}>
                  <AppLayout><FirRegistryPage /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/fir/:id"
              element={
                <ProtectedRoute roles={['police_officer', 'judicial_authority']}>
                  <AppLayout><FirDetailPage /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/vault"
              element={
                <ProtectedRoute roles={['police_officer', 'judicial_authority']}>
                  <AppLayout><VaultPage /></AppLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/vault/:id"
              element={
                <ProtectedRoute roles={['police_officer', 'judicial_authority']}>
                  <AppLayout><EvidenceDetailPage /></AppLayout>
                </ProtectedRoute>
              }
            />

            {/* Judicial only */}
            <Route
              path="/audit"
              element={
                <ProtectedRoute roles={['judicial_authority']}>
                  <AppLayout><AuditLogPage /></AppLayout>
                </ProtectedRoute>
              }
            />

            {/* Admin only */}
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute roles={['admin']}>
                  <AppLayout><AdminUsersPage /></AppLayout>
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
