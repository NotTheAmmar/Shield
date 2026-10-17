import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
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
import ForcePasswordChangePage from './pages/ForcePasswordChangePage';
import ForensicUploadPage from './pages/ForensicUploadPage';
import JudicialMagistratePage from './pages/JudicialMagistratePage';
import SessionsJudgePage from './pages/SessionsJudgePage';
import AdvocatePortalPage from './pages/AdvocatePortalPage';

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

/**
 * Gate that intercepts authenticated users who have not yet changed their
 * temporary password. They see ONLY the ForcePasswordChangePage until done.
 */
function MustChangePasswordGate({ children }) {
  const { isAuthenticated, mustChangePassword } = useAuth();
  if (isAuthenticated && mustChangePassword) {
    return <ForcePasswordChangePage />;
  }
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <MustChangePasswordGate>
            <Routes>
              {/* Public */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected: All authenticated roles */}
              <Route
                path="/"
                element={
                  <ProtectedRoute roles={['police_officer', 'judicial_authority', 'judicial_magistrate', 'sessions_judge', 'forensic_expert', 'advocate', 'admin']}>
                    <AppLayout><DashboardPage /></AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Police */ }
              <Route
                path="/upload"
                element={
                  <ProtectedRoute roles={['police_officer']}>
                    <AppLayout><UploadPage /></AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* FSL Forensic Expert Evidence Ingestion */}
              <Route
                path="/forensic/upload"
                element={
                  <ProtectedRoute roles={['forensic_expert', 'admin']}>
                    <AppLayout><ForensicUploadPage /></AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Police + Judicial */ }
              <Route
                path="/fir"
                element={
                  <ProtectedRoute roles={['police_officer', 'judicial_authority', 'judicial_magistrate', 'sessions_judge']}>
                    <AppLayout><FirRegistryPage /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/fir/:id"
                element={
                  <ProtectedRoute roles={['police_officer', 'judicial_authority', 'judicial_magistrate', 'sessions_judge']}>
                    <AppLayout><FirDetailPage /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vault"
                element={
                  <ProtectedRoute roles={['police_officer', 'judicial_authority', 'judicial_magistrate', 'sessions_judge', 'forensic_expert']}>
                    <AppLayout><VaultPage /></AppLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vault/:id"
                element={
                  <ProtectedRoute roles={['police_officer', 'judicial_authority', 'judicial_magistrate', 'sessions_judge', 'forensic_expert']}>
                    <AppLayout><EvidenceDetailPage /></AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Judicial */ }
              <Route
                path="/audit"
                element={
                  <ProtectedRoute roles={['judicial_authority', 'judicial_magistrate', 'sessions_judge']}>
                    <AppLayout><AuditLogPage /></AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Person 4: Judicial Magistrate Pre-Trial Bench */}
              <Route
                path="/judicial"
                element={
                  <ProtectedRoute roles={['judicial_magistrate', 'judicial_authority', 'admin']}>
                    <AppLayout><JudicialMagistratePage /></AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Person 4: Sessions Judge Trial Bench */}
              <Route
                path="/judge"
                element={
                  <ProtectedRoute roles={['sessions_judge', 'judicial_authority', 'admin']}>
                    <AppLayout><SessionsJudgePage /></AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Person 4: Advocate Discovery & Vakalatnama Portal */}
              <Route
                path="/advocate"
                element={
                  <ProtectedRoute roles={['advocate', 'admin']}>
                    <AppLayout><AdvocatePortalPage /></AppLayout>
                  </ProtectedRoute>
                }
              />

              {/* Admin */ }
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
          </MustChangePasswordGate>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

