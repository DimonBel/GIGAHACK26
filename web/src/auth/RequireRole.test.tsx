import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type { Role, User } from '../api/types';
import { AuthContext } from './context';
import { RequireRole } from './RequireRole';

function userWith(role: Role, mustChangePassword = false): User {
  return {
    id: 1,
    email: `${role}@medpark.md`,
    full_name: 'Test',
    position: '',
    specialty: '',
    job_title: '',
    role,
    active: true,
    must_change_password: mustChangePassword,
    created_at: '2026-09-26T18:00:00Z',
  };
}

function LoginProbe() {
  const state = useLocation().state as { from?: string } | null;
  return <p>Login page{state?.from ? `, back to ${state.from}` : ''}</p>;
}

function renderAt(path: string, user: User | null, signedOut = false) {
  render(
    <AuthContext value={{ user, signedOut, login: vi.fn(), logout: vi.fn(), changePassword: vi.fn() }}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route path="/" element={<p>Dashboard</p>} />
          <Route element={<RequireRole />}>
            <Route path="/change-password" element={<p>Change password page</p>} />
          </Route>
          <Route element={<RequireRole roles={['admin']} />}>
            <Route path="/admin/users" element={<p>Users page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext>,
  );
}

describe('RequireRole', () => {
  it('shows the page to the allowed role', () => {
    renderAt('/admin/users', userWith('admin'));
    expect(screen.getByText('Users page')).toBeInTheDocument();
  });

  it('sends anonymous visitors to the login page, to come back after signing in', () => {
    renderAt('/admin/users', null);
    expect(screen.getByText('Login page, back to /admin/users')).toBeInTheDocument();
  });

  it('does not keep the page of someone who signed out for the next person', () => {
    renderAt('/admin/users', null, true);
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('shows only the change-password page while an admin-chosen password is in use', () => {
    renderAt('/admin/users', userWith('admin', true));
    expect(screen.getByText('Change password page')).toBeInTheDocument();
    cleanup();

    renderAt('/change-password', userWith('moderator', true));
    expect(screen.getByText('Change password page')).toBeInTheDocument();
  });

  it('sends other roles to the dashboard', () => {
    renderAt('/admin/users', userWith('moderator'));
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
