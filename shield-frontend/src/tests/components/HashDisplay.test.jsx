import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HashDisplay from '../../components/HashDisplay';

const HASH = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';

describe('HashDisplay', () => {
  it('renders the full hash by default', () => {
    render(<HashDisplay hash={HASH} />);
    expect(screen.getByTestId('hash-display')).toBeInTheDocument();
    expect(screen.getByText(HASH)).toBeInTheDocument();
  });

  it('truncates the hash when truncate=true', () => {
    render(<HashDisplay hash={HASH} truncate />);
    // Should show truncated version like "a1b2c3d4e5f67890...23456"
    expect(screen.queryByText(HASH)).not.toBeInTheDocument();
    expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
  });

  it('renders custom label', () => {
    render(<HashDisplay hash={HASH} label="My Label" />);
    expect(screen.getByText('My Label')).toBeInTheDocument();
  });

  it('renders nothing when hash is null', () => {
    const { container } = render(<HashDisplay hash={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('calls clipboard.writeText on copy button click', async () => {
    render(<HashDisplay hash={HASH} />);
    const copyBtn = screen.getByLabelText('Copy hash to clipboard');
    fireEvent.click(copyBtn);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(HASH);
    });
  });
});
