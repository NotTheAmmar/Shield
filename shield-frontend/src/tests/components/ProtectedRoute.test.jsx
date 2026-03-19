import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../../components/ProtectedRoute';

// Mock useAuth
vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../hooks/useAuth';

function renderWithRouter(ui, { initialEntries = ['/'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route path="/" element={<div>Dashboard</div>} />
        <Route path="/protected" element={ui} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('redirects unauthenticated user to /login', () => {
    useAuth.mockReturnValue({ isAuthenticated: false, hasRole: () => false });
    renderWithRouter(
      <ProtectedRoute roles={['police_officer']}><div>Secret</div></ProtectedRoute>,
      { initialEntries: ['/protected'] }
    );
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('redirects authenticated user with wrong role to /', () => {
    useAuth.mockReturnValue({ isAuthenticated: true, hasRole: (roles) => roles.includes('admin') });
    renderWithRouter(
      <ProtectedRoute roles={['police_officer']}><div>Secret</div></ProtectedRoute>,
      { initialEntries: ['/protected'] }
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('renders children for authenticated user with correct role', () => {
    useAuth.mockReturnValue({ isAuthenticated: true, hasRole: (roles) => roles.includes('police_officer') });
    renderWithRouter(
      <ProtectedRoute roles={['police_officer']}><div>Secret</div></ProtectedRoute>,
      { initialEntries: ['/protected'] }
    );
    expect(screen.getByText('Secret')).toBeInTheDocument();
  });

  it('renders children when no roles restriction given and authenticated', () => {
    useAuth.mockReturnValue({ isAuthenticated: true, hasRole: () => true });
    renderWithRouter(
      <ProtectedRoute><div>Open Protected</div></ProtectedRoute>,
      { initialEntries: ['/protected'] }
    );
    expect(screen.getByText('Open Protected')).toBeInTheDocument();
  });
});
