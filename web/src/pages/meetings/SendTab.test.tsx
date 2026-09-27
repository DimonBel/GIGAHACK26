import { ModalsProvider } from '@mantine/modals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DirectoryEntry, DistributionList, Meeting, Minutes } from '../../api/types';
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
  minutes_language: 'ro',
  has_audio: false,
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

const directory: DirectoryEntry[] = [
  {
    id: 1,
    full_name: 'Maria Ionescu',
    position: 'Doctor',
    specialty: 'Cardiology',
    job_title: 'Physician',
    email: 'maria@medpark.md',
  },
];

const attendees: Minutes['attendees'] = [
  { user_id: 1, name: 'Maria Ionescu', job_title: 'Physician', position: 'Doctor', specialty: 'Cardiology' },
  { user_id: 99, name: 'Unknown Guest', job_title: '', position: '', specialty: '' },
  { user_id: null, name: 'Visitor', job_title: '', position: '', specialty: '' },
];

const ANSWERS: Record<string, unknown> = {
  '/api/lists': [board],
  '/api/directory': [],
  '/api/directory/domains': ['medpark.md', 'medpark.local'],
  '/api/meetings/m1/minutes': minutes,
  '/api/meetings/m1/email-preview': {
    subject: '[Medical] Medical board',
    language: 'ro',
    html: '<p>Bună ziua,</p>',
    text: 'Bună ziua,\n\nVă transmitem atașat procesul-verbal al ședinței „Medical board” din 26.09.2026.\n',
    attachment: 'Proces-verbal - Medical board - 26.09.2026.pdf',
  },
};

describe('SendTab', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(ANSWERS[url]), { status: 200 }))),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows the email as it will be sent: its note, and the minutes as the attached PDF', async () => {
    renderWithProviders(
      <ModalsProvider>
        <SendTab meeting={meeting} active />
      </ModalsProvider>,
    );

    expect(await screen.findByText(/Vă transmitem atașat procesul-verbal/)).toBeInTheDocument();
    expect(screen.getByText('Proces-verbal - Medical board - 26.09.2026.pdf')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open PDF' })).toHaveAttribute('href', '/api/meetings/m1/minutes.pdf');
  });

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

  it('puts the attendees who are app users in To, skipping guests and unmatched ids', async () => {
    const answers: Record<string, unknown> = {
      ...ANSWERS,
      '/api/directory': directory,
      '/api/meetings/m1/minutes': { ...minutes, attendees },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(answers[url]), { status: 200 }))),
    );

    renderWithProviders(
      <ModalsProvider>
        <SendTab meeting={meeting} active />
      </ModalsProvider>,
    );

    expect(await screen.findByText('Maria Ionescu <maria@medpark.md>')).toBeInTheDocument();
    const addBack = screen.getByRole('button', { name: 'Add the attendees back (To)' });
    expect(addBack).toBeDisabled();

    await userEvent.click(screen.getByLabelText('Remove maria@medpark.md'));
    expect(screen.queryByText('Maria Ionescu <maria@medpark.md>')).not.toBeInTheDocument();
    expect(addBack).toBeEnabled();

    await userEvent.click(addBack);
    expect(screen.getByText('Maria Ionescu <maria@medpark.md>')).toBeInTheDocument();
  });
});
