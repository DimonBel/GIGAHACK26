import { ModalsProvider } from '@mantine/modals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '../../api/types';
import { AuthContext } from '../../auth/context';
import { renderWithProviders } from '../../test/render';
import { UsersPage } from './UsersPage';

function user(overrides: Partial<User> & Pick<User, 'id' | 'full_name' | 'email'>): User {
  return {
    position: '',
    specialty: '',
    job_title: '',
    role: 'user',
    active: true,
    must_change_password: false,
    created_at: '2026-09-26T18:00:00Z',
    ...overrides,
  };
}

const USERS: User[] = [
  user({
    id: 1,
    full_name: 'Ana Popescu',
    email: 'ana@medpark.md',
    position: 'doctor',
    specialty: 'neurologist',
    job_title: 'vice president',
    role: 'admin',
  }),
  user({ id: 2, full_name: 'Ion Rusu', email: 'ion@medpark.md' }),
];

function renderUsersPage() {
  return renderWithProviders(
    <AuthContext value={{ user: USERS[0], signedOut: false, login: vi.fn(), logout: vi.fn(), changePassword: vi.fn() }}>
      <ModalsProvider>
        <UsersPage />
      </ModalsProvider>
    </AuthContext>,
  );
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(USERS), { status: 200 }))),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows the function, position and specialty under the name, skipping empty ones', async () => {
    renderUsersPage();
    expect(await screen.findByText('vice president · doctor · neurologist')).toBeInTheDocument();
    const ionRow = (await screen.findByText('Ion Rusu')).closest('tr');
    expect(ionRow?.textContent).not.toContain('·');
  });

  it('matches the search on specialty and function', async () => {
    renderUsersPage();
    await screen.findByText('Ana Popescu');
    await userEvent.type(screen.getByLabelText('Search'), 'neurologist');
    expect(screen.getByText('Ana Popescu')).toBeInTheDocument();
    expect(screen.queryByText('Ion Rusu')).not.toBeInTheDocument();
  });

  it('offers function, position and specialty fields when creating a user', async () => {
    renderUsersPage();
    await userEvent.click(await screen.findByRole('button', { name: 'New user' }));
    expect(screen.getByLabelText('Function')).toBeInTheDocument();
    expect(screen.getByLabelText('Position')).toBeInTheDocument();
    expect(screen.getByLabelText('Specialty')).toBeInTheDocument();
  });
});
