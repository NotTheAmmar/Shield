import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// Mock react-router-dom Navigate
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../hooks/useAuth';
import LoginPage from '../../pages/LoginPage';

function wrap() {
  return render(<MemoryRouter><LoginPage /></MemoryRouter>);
}

describe('LoginPage', () => {
  const mockLogin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ isAuthenticated: false, login: mockLogin });
    mockLogin.mockResolvedValue({});
  });

  it('renders all form fields', () => {
    wrap();
    expect(screen.getByLabelText(/official email/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('renders role dropdown with all three roles', () => {
    wrap();
    const select = screen.getByLabelText(/role/i);
    expect(select).toBeInTheDocument();
    expect(select.querySelectorAll('option')).toHaveLength(3);
  });

  it('shows error when submitting with empty fields', async () => {
    wrap();
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Please fill in all fields.');
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('calls login with form values on valid submission', async () => {
    wrap();
    fireEvent.change(screen.getByLabelText(/official email/i), { target: { value: 'officer@police.gov.in' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'officer@police.gov.in',
        password: 'password123',
        role: 'police_officer',
      });
    });
  });

  it('shows server error message on login failure', async () => {
    mockLogin.mockRejectedValue({ message: 'Invalid credentials' });
    wrap();
    fireEvent.change(screen.getByLabelText(/official email/i), { target: { value: 'bad@email.com' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'wrongpw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
    });
  });

  it('toggles password visibility', () => {
    wrap();
    const passwordInput = screen.getByPlaceholderText('••••••••');
    expect(passwordInput).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByLabelText(/show password/i));
    expect(screen.getByPlaceholderText('••••••••')).toHaveAttribute('type', 'text');
  });
});
