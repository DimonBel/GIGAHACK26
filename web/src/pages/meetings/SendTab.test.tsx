import { ModalsProvider } from '@mantine/modals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DistributionList, Meeting, Minutes } from '../../api/types';
import { renderWithProviders } from '../../test/render';
import { SendTab } from './SendTab';

const meeting: Meeting = {
  id: 'm1',
  title: 'Medical board',
  meeting_type: 'medical',
  status: 'approved',
  progress: { stage: 'done', done: 0, total: 0, message: '' },
  created_by: { id: 2, full_name: 'Ion Rusu' },
  created_at: '2026-09-26T18:00:00Z',
  duration_s: 703,
  language: 'ro',
  error: null,
  approved_by: { id: 2, full_name: 'Ion Rusu' },
  approved_at: '2026-09-26T19:00:00Z',
  sent_at: null,
  timings: null,
};

const board: DistributionList = {
  id: 1,
  name: 'Medical board',
  meeting_type: 'medical',
  members: [
    { user_id: 1, email: 'ana@medpark.md', name: 'Ana Popescu', kind: 'to' },
    { user_id: null, email: 'friend@gmail.com', name: '', kind: 'cc' },
  ],
};

const minutes: Partial<Minutes> = { title: 'Medical board', summary: 'Summary' };

const ANSWERS: Record<string, unknown> = {
  '/api/lists': [board],
  '/api/directory': [],
  '/api/directory/domains': ['medpark.md', 'medpark.local'],
  '/api/meetings/m1/minutes': minutes,
};

describe('SendTab', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(ANSWERS[url]), { status: 200 }))),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('only sends to the allowed recipient domains', async () => {
    renderWithProviders(
      <ModalsProvider>
        <SendTab meeting={meeting} active />
      </ModalsProvider>,
    );

    expect(await screen.findByText(/Remove friend@gmail.com to send/)).toBeInTheDocument();
    expect(screen.getByText('Minutes can only be sent to addresses at medpark.md or medpark.local.')).toBeVisible();
    const send = screen.getByRole('button', { name: 'Send minutes' });
    expect(send).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Add another person (CC)'), 'guest@yahoo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Only addresses at medpark.md or medpark.local')).toBeInTheDocument();

    // Mantine hides the pill's remove button from the accessibility tree: found by its label.
    await userEvent.click(screen.getByLabelText('Remove friend@gmail.com'));
    expect(send).toBeEnabled();
  });
});
