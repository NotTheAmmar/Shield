import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../services/api', () => ({
  firAPI: {
    list: vi.fn().mockResolvedValue({ data: [
      { id: 'fir_001', firNumber: 'FIR/2025/MH/0042' },
    ], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } }),
    upload: vi.fn().mockResolvedValue({ id: 'fir_new', firNumber: 'FIR/2025/MH/0099', hash: 'abc123', status: 'pending' }),
  },
  evidenceAPI: {
    upload: vi.fn().mockResolvedValue({ uploaded: [{ id: 'ev_new', fileName: 'test.jpg', hash: 'def456', status: 'pending' }] }),
  },
}));

vi.mock('../../hooks/useHashFile', () => ({
  useHashFile: vi.fn(() => ({
    singleHash: null, singleProgress: 0, computing: false,
    hashes: {}, progress: {}, error: null,
    compute: vi.fn(), reset: vi.fn(),
  })),
}));

import UploadPage from '../../pages/UploadPage';

function wrap() {
  return render(<MemoryRouter><UploadPage /></MemoryRouter>);
}

describe('UploadPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders both tabs', () => {
    wrap();
    expect(document.getElementById('tab-fir')).toBeInTheDocument();
    expect(document.getElementById('tab-evidence')).toBeInTheDocument();
  });

  it('shows FIR tab content by default', () => {
    wrap();
    expect(screen.getByLabelText(/FIR Number/i)).toBeInTheDocument();
    expect(screen.getByTestId('dropzone')).toBeInTheDocument();
  });

  it('switches to Evidence tab on click', async () => {
    wrap();
    const evidenceTab = document.getElementById('tab-evidence');
    fireEvent.click(evidenceTab);
    await waitFor(() => {
      expect(screen.getByLabelText(/Linked FIR/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Category/i)).toBeInTheDocument();
    });
  });

  it('shows validation error when submitting FIR tab without FIR number', async () => {
    wrap();
    const form = document.querySelector('form');
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText('FIR Number is required.')).toBeInTheDocument();
    });
  });

  it('shows validation error when submitting without a file', async () => {
    wrap();
    fireEvent.change(screen.getByLabelText(/FIR Number/i), { target: { value: 'FIR/2025/MH/0001' } });
    const form = document.querySelector('form');
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText('Please select a file to upload.')).toBeInTheDocument();
    });
  });
});
