import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FileText } from 'lucide-react';
import StatCard from '../../components/StatCard';

describe('StatCard', () => {
  it('renders value and label', () => {
    render(<StatCard label="FIRs Uploaded" value={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('FIRs Uploaded')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    const { container } = render(<StatCard label="Test" value={7} icon={FileText} />);
    // lucide renders an SVG
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders em dash when value is undefined', () => {
    render(<StatCard label="Pending" value={undefined} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('applies custom accent color via CSS variable', () => {
    render(<StatCard label="Test" value={1} accent="var(--emerald)" />);
    const card = screen.getByTestId('stat-card');
    expect(card.style.getPropertyValue('--stat-accent')).toBe('var(--emerald)');
  });
});
