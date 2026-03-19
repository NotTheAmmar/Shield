import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/api', () => ({
  dashboardAPI: { getStats: vi.fn().mockResolvedValue(null) },
}));

import { useAuth } from '../../hooks/useAuth';
import DashboardPage from '../../pages/DashboardPage';

function wrap() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>);
}

describe('DashboardPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('shows police officer stat cards (FIRs Uploaded, Evidence Files, Verified, Pending)', async () => {
    useAuth.mockReturnValue({ role: 'police_officer', user: { name: 'Rajesh Kumar' } });
    wrap();
    await waitFor(() => {
      expect(screen.getByText('FIRs Uploaded')).toBeInTheDocument();
      expect(screen.getByText('Evidence Files')).toBeInTheDocument();
      expect(screen.getByText('Verified')).toBeInTheDocument();
      expect(screen.getByText('Pending Verification')).toBeInTheDocument();
    });
  });

  it('shows judicial stat cards (Total FIRs, Total Evidence, Verified Integrity, Tamper Alerts)', async () => {
    useAuth.mockReturnValue({ role: 'judicial_authority', user: { name: 'Priya Nair' } });
    wrap();
    await waitFor(() => {
      expect(screen.getByText('Total FIRs in System')).toBeInTheDocument();
      expect(screen.getByText('Total Evidence Files')).toBeInTheDocument();
      expect(screen.getByText('Verified Integrity')).toBeInTheDocument();
      expect(screen.getByText('Tamper Alerts')).toBeInTheDocument();
    });
  });

  it('shows admin stat cards (Total Users, Active Users, Deactivated Users, Logins)', async () => {
    useAuth.mockReturnValue({ role: 'admin', user: { name: 'Admin Singh' } });
    wrap();
    await waitFor(() => {
      expect(screen.getByText('Total Users')).toBeInTheDocument();
      expect(screen.getByText('Active Users')).toBeInTheDocument();
      expect(screen.getByText('Deactivated Users')).toBeInTheDocument();
      expect(screen.getByText('Logins (24h)')).toBeInTheDocument();
    });
  });

  it('shows Upload quick action for police officer', async () => {
    useAuth.mockReturnValue({ role: 'police_officer', user: { name: 'Rajesh' } });
    wrap();
    await waitFor(() => {
      expect(screen.getByText(/Upload FIR \/ Evidence/)).toBeInTheDocument();
    });
  });

  it('shows Manage Users quick action for admin', async () => {
    useAuth.mockReturnValue({ role: 'admin', user: { name: 'Admin' } });
    wrap();
    await waitFor(() => {
      expect(screen.getByText('Manage Users')).toBeInTheDocument();
    });
  });
});
