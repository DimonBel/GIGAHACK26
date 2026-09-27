import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/client';
import type { User } from '../api/types';
import { AuthContext, type AuthContextValue } from '../auth/context';
import { renderWithProviders } from '../test/render';
import { ChangePasswordPage } from './ChangePasswordPage';

const reader: User = {
  id: 4,
  email: 'ana@medpark.md',
  full_name: 'Ana Popescu',
  position: 'Nurse',
  specialty: '',
  job_title: '',
  role: 'user',
  active: true,
  must_change_password: true,
  created_at: '2026-09-26T18:00:00Z',
};

function renderPage(changePassword: AuthContextValue['changePassword']) {
  return renderWithProviders(
    <AuthContext value={{ user: reader, signedOut: false, login: vi.fn(), logout: vi.fn(), changePassword }}>
      <MemoryRouter initialEntries={['/change-password']}>
        <Routes>
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/" element={<p>Dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext>,
  );
}

async function fill(current: string, next: string, repeat = next) {
  await userEvent.type(screen.getByLabelText(/^current password/i, { selector: 'input' }), current);
  await userEvent.type(screen.getByLabelText(/^new password/i, { selector: 'input' }), next);
  await userEvent.type(screen.getByLabelText(/^repeat the new password/i, { selector: 'input' }), repeat);
  await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
}

describe('ChangePasswordPage', () => {
  it('asks for a password of their own and then opens the dashboard', async () => {
    const changePassword = vi.fn().mockResolvedValue({ ...reader, must_change_password: false });
    renderPage(changePassword);
    expect(screen.getByText(/An administrator set your password/)).toBeInTheDocument();

    await fill('the admin gave me this', 'my very own passphrase');

    expect(changePassword).toHaveBeenCalledWith('the admin gave me this', 'my very own passphrase');
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('checks the new password before calling the server', async () => {
    const changePassword = vi.fn();
    renderPage(changePassword);

    await fill('the admin gave me this', 'too short', 'something else');

    expect(await screen.findByText('At least 12 characters')).toBeInTheDocument();
    expect(screen.getByText('The passwords differ')).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("shows the server's answer on the field it is about", async () => {
    const changePassword = vi.fn().mockRejectedValue(new ApiError(400, 'current: the password is wrong'));
    renderPage(changePassword);

    await fill('a wrong guess', 'my very own passphrase');

    expect(await screen.findByText('The password is wrong')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows other failures above the button', async () => {
    const changePassword = vi.fn().mockRejectedValue(new ApiError(429, 'Too many failed attempts; try again later'));
    renderPage(changePassword);

    await fill('a wrong guess', 'my very own passphrase');

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many failed attempts');
  });
});
