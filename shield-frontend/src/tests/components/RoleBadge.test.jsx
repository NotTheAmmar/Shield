import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RoleBadge from '../../components/RoleBadge';

describe('RoleBadge', () => {
  it('renders Police Officer badge', () => {
    render(<RoleBadge role="police_officer" />);
    const badge = screen.getByTestId('role-badge-police_officer');
    expect(badge).toHaveClass('badge-police');
    expect(badge).toHaveTextContent('Police Officer');
  });

  it('renders Judicial Authority badge', () => {
    render(<RoleBadge role="judicial_authority" />);
    const badge = screen.getByTestId('role-badge-judicial_authority');
    expect(badge).toHaveClass('badge-judicial');
    expect(badge).toHaveTextContent('Judicial Authority');
  });

  it('renders Admin badge', () => {
    render(<RoleBadge role="admin" />);
    const badge = screen.getByTestId('role-badge-admin');
    expect(badge).toHaveClass('badge-admin');
    expect(badge).toHaveTextContent('Admin');
  });

  it('renders nothing for unknown role', () => {
    const { container } = render(<RoleBadge role="unknown_role" />);
    expect(container.firstChild).toBeNull();
  });
});
