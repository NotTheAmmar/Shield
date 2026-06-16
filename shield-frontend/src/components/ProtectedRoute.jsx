import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

/**
 * Wraps a route to require authentication + one of the allowed roles.
 * Unauthenticated → /login
 * Wrong role → / (dashboard)
 */
export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, hasRole, isInitializing, user } = useAuth();

  console.log('[DEBUG ProtectedRoute] Rendering:', { isAuthenticated, isInitializing, roles, user });

  if (isInitializing) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('[DEBUG ProtectedRoute] Not authenticated, redirecting to /login');
    return <Navigate to="/login" replace />;
  }

  if (roles && !hasRole(roles)) {
    console.log('[DEBUG ProtectedRoute] Role check failed, redirecting to /');
    return <Navigate to="/" replace />;
  }

  return children;
}
