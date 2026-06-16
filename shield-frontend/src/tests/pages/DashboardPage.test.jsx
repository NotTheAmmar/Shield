import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/api', () => ({
  dashboardAPI: { getStats: vi.fn() },
  adminAPI: { listUsers: vi.fn() },
  auditAPI: { listAuth: vi.fn() },
}));

import { useAuth } from '../../hooks/useAuth';
import { dashboardAPI, adminAPI, auditAPI } from '../../services/api';
import DashboardPage from '../../pages/DashboardPage';

function wrap() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>);
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set up default resolved values for the API mocks
    dashboardAPI.getStats.mockResolvedValue({
      stats: {
        totalFirs: 12,
        totalEvidence: 34,
        verifiedCount: 30,
        tamperedCount: 4,
      },
      recentActivity: [],
    });
    
    adminAPI.listUsers.mockResolvedValue({
      users: [
        { id: 'usr_1', status: 'active' },
        { id: 'usr_2', status: 'active' },
        { id: 'usr_3', status: 'deactivated' },
      ],
    });
    
    auditAPI.listAuth.mockResolvedValue({
      auditLog: [],
    });
  });

  it('shows police officer stat cards (Total FIRs in System, Total Evidence Files, Verified Integrity, Tamper Alerts)', async () => {
    useAuth.mockReturnValue({ role: 'police_officer', user: { name: 'Rajesh Kumar' } });
    wrap();
    await waitFor(() => {
      expect(screen.getByText('Total FIRs in System')).toBeInTheDocument();
      expect(screen.getByText('Total Evidence Files')).toBeInTheDocument();
      expect(screen.getByText('Verified Integrity')).toBeInTheDocument();
      expect(screen.getByText('Tamper Alerts')).toBeInTheDocument();
    });
  });

  it('shows judicial stat cards (Total FIRs in System, Total Evidence Files, Verified Integrity, Tamper Alerts)', async () => {
    useAuth.mockReturnValue({ role: 'judicial_authority', user: { name: 'Priya Nair' } });
    wrap();
    await waitFor(() => {
      expect(screen.getByText('Total FIRs in System')).toBeInTheDocument();
      expect(screen.getByText('Total Evidence Files')).toBeInTheDocument();
      expect(screen.getByText('Verified Integrity')).toBeInTheDocument();
      expect(screen.getByText('Tamper Alerts')).toBeInTheDocument();
    });
  });

  it('shows admin stat cards (Total System Users, Active Users, Inactive / Suspended)', async () => {
    useAuth.mockReturnValue({ role: 'admin', user: { name: 'Admin Singh' } });
    wrap();
    await waitFor(() => {
      expect(screen.getByText('Total System Users')).toBeInTheDocument();
      expect(screen.getByText('Active Users')).toBeInTheDocument();
      expect(screen.getByText('Inactive / Suspended')).toBeInTheDocument();
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
    useAuth.mockReturnValue({ role: 'admin', user: { name: 'admin' } });
    wrap();
    await waitFor(() => {
      expect(screen.getByText('Manage Users')).toBeInTheDocument();
    });
  });
});
