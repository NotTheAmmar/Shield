import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import NavBar from '../../components/NavBar';

// Mock hooks
vi.mock('../../hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../hooks/useTheme', () => ({ useTheme: vi.fn(() => ({ theme: 'light', toggle: vi.fn() })) }));

import { useAuth } from '../../hooks/useAuth';

const MOCK_OFFICER = {
  user: { name: 'Rajesh Kumar', employeeId: 'MH/INS/2041' },
  role: 'police_officer',
  isAuthenticated: true,
  logout: vi.fn().mockResolvedValue(undefined),
};
const MOCK_JUDICIAL = { ...MOCK_OFFICER, role: 'judicial_authority' };
const MOCK_ADMIN = { ...MOCK_OFFICER, role: 'admin' };

function wrap(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('NavBar', () => {
  it('returns null when not authenticated', () => {
    useAuth.mockReturnValue({ isAuthenticated: false, role: null, user: null, logout: vi.fn() });
    const { container } = wrap(<NavBar />);
    expect(container.firstChild).toBeNull();
  });

  it('shows Dashboard link for all roles', () => {
    useAuth.mockReturnValue(MOCK_OFFICER);
    wrap(<NavBar />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows Upload link only for police_officer', () => {
    useAuth.mockReturnValue(MOCK_OFFICER);
    wrap(<NavBar />);
    expect(screen.getByText('Upload')).toBeInTheDocument();
  });

  it('hides Upload link for judicial_authority', () => {
    useAuth.mockReturnValue(MOCK_JUDICIAL);
    wrap(<NavBar />);
    expect(screen.queryByText('Upload')).not.toBeInTheDocument();
  });

  it('shows Audit Log only for judicial_authority', () => {
    useAuth.mockReturnValue(MOCK_JUDICIAL);
    wrap(<NavBar />);
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
  });

  it('hides Audit Log for police_officer', () => {
    useAuth.mockReturnValue(MOCK_OFFICER);
    wrap(<NavBar />);
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument();
  });

  it('shows User Management only for admin', () => {
    useAuth.mockReturnValue(MOCK_ADMIN);
    wrap(<NavBar />);
    expect(screen.getByText('User Management')).toBeInTheDocument();
  });

  it('hides FIR Registry and Evidence Vault for admin', () => {
    useAuth.mockReturnValue(MOCK_ADMIN);
    wrap(<NavBar />);
    expect(screen.queryByText('FIR Registry')).not.toBeInTheDocument();
    expect(screen.queryByText('Evidence Vault')).not.toBeInTheDocument();
  });

  it('opens user dropdown on button click', () => {
    useAuth.mockReturnValue(MOCK_OFFICER);
    wrap(<NavBar />);
    const btn = screen.getByRole('button', { name: /rajesh/i });
    fireEvent.click(btn);
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });
});
