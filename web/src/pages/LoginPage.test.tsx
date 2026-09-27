import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/client';
import type { User } from '../api/types';
import { AuthContext, type AuthContextValue } from '../auth/context';
import { renderWithProviders } from '../test/render';
import { LoginPage } from './LoginPage';

const moderator: User = {
  id: 2,
  email: 'ion@medpark.md',
  full_name: 'Ion Rusu',
  position: 'Surgeon',
  specialty: '',
  job_title: '',
  role: 'moderator',
  active: true,
  must_change_password: false,
  created_at: '2026-09-26T18:00:00Z',
};

function renderLogin(auth: AuthContextValue, from?: string) {
  return renderWithProviders(
    <AuthContext value={auth}>
      <MemoryRouter initialEntries={[{ pathname: '/login', state: from === undefined ? undefined : { from } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Dashboard</p>} />
          <Route path="/meetings/:id" element={<p>Meeting page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext>,
  );
}

describe('LoginPage', () => {
  it("signs in with the typed credentials and shows the server's error", async () => {
    const login = vi.fn().mockRejectedValue(new ApiError(401, 'Wrong email or password'));
    renderLogin({ user: null, signedOut: false, login, logout: vi.fn(), changePassword: vi.fn() });

    await userEvent.type(screen.getByLabelText(/^email/i, { selector: 'input' }), ' ion@medpark.md ');
    await userEvent.type(screen.getByLabelText(/^password/i, { selector: 'input' }), 'a long password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(login).toHaveBeenCalledWith('ion@medpark.md', 'a long password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password');
  });

  it('shows the copyright under the form', () => {
    renderLogin({ user: null, signedOut: false, login: vi.fn(), logout: vi.fn(), changePassword: vi.fn() });

    expect(screen.getByText('© 2026 Gigahack. All rights reserved.')).toBeInTheDocument();
  });

  it('checks the fields before calling the server', async () => {
    const login = vi.fn();
    renderLogin({ user: null, signedOut: false, login, logout: vi.fn(), changePassword: vi.fn() });

    await userEvent.type(screen.getByLabelText(/^email/i, { selector: 'input' }), 'not-an-email');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('sends a signed-in user to the dashboard', () => {
    renderLogin({ user: moderator, signedOut: false, login: vi.fn(), logout: vi.fn(), changePassword: vi.fn() });
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('returns a signed-in user to the page they asked for', () => {
    renderLogin(
      { user: moderator, signedOut: false, login: vi.fn(), logout: vi.fn(), changePassword: vi.fn() },
      '/meetings/6f1c',
    );
    expect(screen.getByText('Meeting page')).toBeInTheDocument();
  });

  it.each(['//evil.example/login', '/\\evil.example'])('never returns to another site (%s)', (from) => {
    renderLogin({ user: moderator, signedOut: false, login: vi.fn(), logout: vi.fn(), changePassword: vi.fn() }, from);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
