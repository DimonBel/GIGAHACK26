import { ModalsProvider } from '@mantine/modals';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { templatesApi } from '../../api/endpoints';
import type { MinutesTemplate } from '../../api/types';
import { renderWithProviders } from '../../test/render';
import { TemplatesPage } from './TemplatesPage';

/** Version 0, the built-in default, unless overridden. */
function version(overrides: Partial<MinutesTemplate> = {}): MinutesTemplate {
  return {
    meeting_type: 'medical',
    version: 0,
    sections: [
      { key: 'summary', enabled: true },
      { key: 'key_moments', enabled: true },
      { key: 'topics', enabled: true },
      { key: 'other_decisions', enabled: true },
      { key: 'action_items', enabled: true },
      { key: 'open_issues', enabled: true },
      { key: 'attendees', enabled: true },
      { key: 'participants', enabled: true },
      { key: 'warnings', enabled: true },
    ],
    topic_fields: { status: true, findings: true, decisions: true },
    instructions: '',
    note: '',
    created_by: null,
    created_at: null,
    ...overrides,
  };
}

function renderPage() {
  return renderWithProviders(
    <ModalsProvider>
      <TemplatesPage />
    </ModalsProvider>,
  );
}

describe('TemplatesPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a live preview, toggling a section updates it, and the save bar appears only with changes', async () => {
    vi.spyOn(templatesApi, 'versions').mockResolvedValue([version()]);
    const created = version({
      version: 1,
      created_by: { id: 1, full_name: 'Ana Popescu' },
      created_at: '2026-09-27T12:00:00Z',
      note: 'Hide open issues',
      sections: [
        { key: 'summary', enabled: true },
        { key: 'key_moments', enabled: true },
        { key: 'topics', enabled: true },
        { key: 'other_decisions', enabled: true },
        { key: 'action_items', enabled: true },
        { key: 'open_issues', enabled: false },
        { key: 'attendees', enabled: true },
        { key: 'participants', enabled: true },
        { key: 'warnings', enabled: true },
      ],
    });
    const create = vi.spyOn(templatesApi, 'create').mockResolvedValue(created);

    renderPage();

    // The live preview renders real sample content for the sections that are on.
    await screen.findByText('Who covers the front desk during the training sessions?');
    // The sticky bar only mounts once there is something unsaved.
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    // The switch's accessible label includes its description text too (hence the prefix match); anchored so it
    // does not also match the "Move Open issues up/down" buttons.
    await userEvent.click(screen.getByLabelText(/^Open issues/));

    // Turning the section off dims it in the list and drops it from the preview instantly.
    await waitFor(() =>
      expect(screen.queryByText('Who covers the front desk during the training sessions?')).not.toBeInTheDocument(),
    );
    const saveBar = await screen.findByText('Unsaved changes');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeEnabled();

    await userEvent.type(screen.getByLabelText('What changed (optional)'), 'Hide open issues');
    await userEvent.click(save);

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const [calledType, calledInput] = create.mock.calls[0];
    expect(calledType).toBe('medical');
    expect(calledInput.note).toBe('Hide open issues');
    expect(calledInput.sections.find((section) => section.key === 'open_issues')).toEqual({
      key: 'open_issues',
      enabled: false,
    });

    // The new version becomes the clean baseline: the bar hides and the history tab counts it.
    await waitFor(() => expect(saveBar).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('tab', { name: /Version history/ }));
    expect(screen.getByRole('tab', { name: 'Version history · 2' })).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('1');
    expect(rows[0]).toHaveTextContent('Active');
    expect(rows[0]).toHaveTextContent('Ana Popescu');
    expect(rows[1]).toHaveTextContent('0');
    expect(rows[1]).toHaveTextContent('Built-in');
  });

  it('discards an edit back to the saved version without saving', async () => {
    vi.spyOn(templatesApi, 'versions').mockResolvedValue([version()]);
    const create = vi.spyOn(templatesApi, 'create');

    renderPage();

    const keyMoments = await screen.findByLabelText(/^Key moments/);
    expect(keyMoments).toBeChecked();
    await userEvent.click(keyMoments);
    await screen.findByText('Unsaved changes');

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
    expect(keyMoments).toBeChecked();
    expect(create).not.toHaveBeenCalled();
  });

  it('asks for confirmation before restoring a version', async () => {
    vi.spyOn(templatesApi, 'versions').mockResolvedValue([
      version({
        version: 1,
        created_by: { id: 2, full_name: 'Ion Rusu' },
        created_at: '2026-09-25T10:00:00Z',
        note: 'Trim instructions',
      }),
      version(),
    ]);
    const restore = vi
      .spyOn(templatesApi, 'restore')
      .mockResolvedValue(
        version({ version: 2, created_by: { id: 2, full_name: 'Ion Rusu' }, created_at: '2026-09-27T12:00:00Z' }),
      );

    renderPage();
    await userEvent.click(await screen.findByRole('tab', { name: /Version history/ }));
    await screen.findByText('Ion Rusu');

    // Only the non-active (built-in) version offers Restore.
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Restore version 0?')).toBeInTheDocument();
    expect(restore).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(restore).toHaveBeenCalledWith('medical', 0));
  });

  it('switching meeting type keeps an unsaved edit, still unsaved, instead of losing it', async () => {
    vi.spyOn(templatesApi, 'versions').mockResolvedValue([version()]);

    renderPage();

    const keyMoments = await screen.findByLabelText(/^Key moments/);
    await userEvent.click(keyMoments);
    await screen.findByText('Unsaved changes');

    await userEvent.click(screen.getByRole('radio', { name: 'Executive' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Medical' }));

    // The edit survives the round trip, and is still one to save or discard.
    expect(await screen.findByLabelText(/^Key moments/)).not.toBeChecked();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByLabelText(/^Key moments/)).toBeChecked();
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
  });
});
