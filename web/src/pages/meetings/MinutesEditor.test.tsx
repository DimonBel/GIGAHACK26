import { ModalsProvider } from '@mantine/modals';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import type { Meeting, Minutes } from '../../api/types';
import { renderWithProviders } from '../../test/render';
import { MinutesEditor } from './MinutesEditor';

const meeting: Meeting = {
  id: 'm1',
  title: 'Medical board',
  meeting_type: 'medical',
  status: 'ready',
  progress: { stage: 'done', done: 0, total: 0, message: '' },
  created_by: { id: 2, full_name: 'Ion Rusu' },
  created_at: '2026-09-26T18:00:00Z',
  duration_s: 703,
  language: 'ro',
  error: null,
  approved_by: null,
  approved_at: null,
  sent_at: null,
  timings: null,
};

const minutes: Minutes = {
  title: 'Medical board',
  summary: 'Summary',
  suggestions: [],
  key_moments: [],
  topics: [],
  decisions: [],
  action_items: [],
  open_issues: ['Issue A', 'Issue B', 'Issue C'],
  warnings: [],
  participants: {},
};

function renderEditor() {
  // A data router, because the editor asks before leaving with unsaved changes.
  const router = createMemoryRouter([
    { path: '/', element: <MinutesEditor meeting={meeting} minutes={minutes} onApproved={() => undefined} /> },
  ]);
  renderWithProviders(
    <ModalsProvider>
      <RouterProvider router={router} />
    </ModalsProvider>,
  );
}

const openIssues = () =>
  screen.getAllByRole('textbox', { name: /^Open issue \d+$/ }).map((input) => (input as HTMLTextAreaElement).value);

describe('MinutesEditor', () => {
  it('removes the right row and shows the remaining text in place', async () => {
    renderEditor();
    expect(screen.getByRole('status')).toHaveTextContent('all changes saved');

    await userEvent.click(screen.getByRole('button', { name: 'Remove open issue 2' }));

    expect(openIssues()).toEqual(['Issue A', 'Issue C']);
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
  });

  it('adds an empty row that can be typed into', async () => {
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Add open issue' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Open issue 4' }), 'Issue D');

    expect(openIssues()).toEqual(['Issue A', 'Issue B', 'Issue C', 'Issue D']);
  });
});
