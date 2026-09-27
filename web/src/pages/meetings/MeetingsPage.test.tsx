import { ModalsProvider } from '@mantine/modals';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { meetingsApi } from '../../api/endpoints';
import type { Meeting, Role, User } from '../../api/types';
import { AuthContext } from '../../auth/context';
import { renderWithProviders } from '../../test/render';
import { MeetingsPage } from './MeetingsPage';

const person = (id: number, role: Role): User => ({
  id,
  email: `user${id}@medpark.md`,
  full_name: `User ${id}`,
  position: '',
  specialty: '',
  job_title: '',
  role,
  active: true,
  must_change_password: false,
  created_at: '2026-09-26T08:00:00Z',
});

const meeting = (id: string, title: string, ownerId: number, status: Meeting['status'] = 'ready'): Meeting => ({
  id,
  title,
  meeting_type: 'medical',
  status,
  progress: null,
  created_by: { id: ownerId, full_name: `User ${ownerId}` },
  created_at: '2026-09-26T08:00:00Z',
  duration_s: 703,
  language: 'ro',
  minutes_language: 'ro',
  has_audio: false,
  error: null,
  approved_by: null,
  approved_at: null,
  sent_at: null,
  timings: null,
});

function renderAs(user: User) {
  vi.spyOn(meetingsApi, 'list').mockResolvedValue([
    meeting('m1', 'Morning round', user.id),
    meeting('m2', 'Board of another moderator', 99),
  ]);
  renderWithProviders(
    <AuthContext value={{ user, signedOut: false, login: vi.fn(), logout: vi.fn(), changePassword: vi.fn() }}>
      <ModalsProvider>
        <MemoryRouter>
          <MeetingsPage />
        </MemoryRouter>
      </ModalsProvider>
    </AuthContext>,
  );
}

const actionsOf = async (title: string) => {
  await userEvent.click(await screen.findByRole('button', { name: `Actions for ${title}` }));
  return within(await screen.findByRole('menu'));
};

afterEach(() => vi.restoreAllMocks());

describe('MeetingsPage actions', () => {
  it('lets a moderator delete their own meetings only', async () => {
    renderAs(person(2, 'moderator'));

    expect((await actionsOf('Morning round')).getByRole('menuitem', { name: 'Delete meeting' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    const other = await actionsOf('Board of another moderator');
    expect(other.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument();
    expect(other.queryByRole('menuitem', { name: 'Delete meeting' })).not.toBeInTheDocument();
  });

  it('lets an admin delete any meeting, after confirming', async () => {
    const remove = vi.spyOn(meetingsApi, 'remove').mockResolvedValue(undefined);
    renderAs(person(1, 'admin'));

    await userEvent.click(
      (await actionsOf('Board of another moderator')).getByRole('menuitem', { name: 'Delete meeting' }),
    );
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));

    expect(remove).toHaveBeenCalledWith('m2');
  });
});
