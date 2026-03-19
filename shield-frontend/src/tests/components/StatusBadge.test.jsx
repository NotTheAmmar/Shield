import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import StatusBadge from '../../components/StatusBadge';

describe('StatusBadge', () => {
  it('renders Verified badge with correct class and text', () => {
    render(<StatusBadge status="verified" />);
    const badge = screen.getByTestId('badge-verified');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('badge-verified');
    expect(badge).toHaveTextContent('Verified');
  });

  it('renders Pending badge with correct class and text', () => {
    render(<StatusBadge status="pending" />);
    const badge = screen.getByTestId('badge-pending');
    expect(badge).toHaveClass('badge-pending');
    expect(badge).toHaveTextContent('Pending');
  });

  it('renders Tampered badge with correct class and text', () => {
    render(<StatusBadge status="tampered" />);
    const badge = screen.getByTestId('badge-tampered');
    expect(badge).toHaveClass('badge-tampered');
    expect(badge).toHaveTextContent('Tampered');
  });

  it('falls back to pending for unknown status', () => {
    render(<StatusBadge status="unknown_xyz" />);
    // Falls back to pending config
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});
