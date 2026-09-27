import { ModalsProvider } from '@mantine/modals';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { meetingsApi } from '../../api/endpoints';
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
  minutes_language: 'ro',
  has_audio: false,
  error: null,
  approved_by: null,
  approved_at: null,
  sent_at: null,
  timings: null,
};

const minutes: Minutes = {
  title: 'Medical board',
  summary: 'Summary',
  key_moments: [],
  topics: [
    { name: 'Bed 8', time: '00:03', status: 'Stable', findings: [] },
    { name: 'Bed 9', time: '06:10', status: 'Fever', findings: [] },
  ],
  decisions: [{ decision: 'Start amikacin', time: '01:32', patient: 'Bed 8' }],
  action_items: [],
  open_issues: ['Issue A', 'Issue B', 'Issue C'],
  warnings: [],
  attendees: [],
  participants: {},
};

function renderEditor(onApproved = () => undefined) {
  // A data router, because the editor asks before leaving with unsaved changes.
  const router = createMemoryRouter([
    { path: '/', element: <MinutesEditor meeting={meeting} minutes={minutes} active onApproved={onApproved} /> },
  ]);
  renderWithProviders(
    <ModalsProvider>
      <RouterProvider router={router} />
    </ModalsProvider>,
  );
}

const openIssues = () =>
  screen.getAllByRole('textbox', { name: /^Open issue \d+$/ }).map((input) => (input as HTMLTextAreaElement).value);

const sidebar = () => screen.getByRole('navigation', { name: 'Minutes sections' });

/** The server stores what it is sent. */
const mockSave = () => vi.spyOn(meetingsApi, 'saveMinutes').mockImplementation((_id, saved) => Promise.resolve(saved));

afterEach(() => vi.restoreAllMocks());

describe('MinutesEditor', () => {
  it('opens the draft to read, one page per topic', async () => {
    renderEditor();
    expect(screen.getByRole('heading', { name: 'Medical board' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Bed 9/ }));

    expect(screen.getByRole('heading', { name: 'Bed 9' })).toBeInTheDocument();
    expect(screen.getByText('Topic 2 of 2')).toBeInTheDocument();
    expect(sidebar()).toBeInTheDocument();
  });

  it('removes the right row and shows the remaining text in place', async () => {
    renderEditor();
    expect(screen.getByRole('status')).toHaveTextContent('all changes saved');

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove open issue 2' }));

    expect(openIssues()).toEqual(['Issue A', 'Issue C']);
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
  });

  it('adds an empty row that can be typed into', async () => {
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add open issue' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Open issue 4' }), 'Issue D');

    expect(openIssues()).toEqual(['Issue A', 'Issue B', 'Issue C', 'Issue D']);
  });

  it('keeps the decisions of a topic that is renamed', async () => {
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: /Bed 8/ }));
    const name = screen.getByRole('textbox', { name: 'Topic' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Salon 3');
    await userEvent.click(screen.getByRole('button', { name: 'Done editing' }));

    expect(screen.getByRole('heading', { name: 'Salon 3' })).toBeInTheDocument();
    expect(screen.getByText('Start amikacin')).toBeInTheDocument();
  });

  it('adds a topic and opens its page to fill in', async () => {
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(within(sidebar()).getByRole('button', { name: 'Add topic' }));

    expect(screen.getByText('Topic 3 of 3')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Topic' })).toHaveValue('');
  });

  it('saves what was edited and shows it saved', async () => {
    const save = mockSave();
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Open issue 1' }), ' urgently');
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][1].open_issues).toEqual(['Issue A urgently', 'Issue B', 'Issue C']);
    expect(await screen.findByText('Draft minutes · all changes saved')).toBeInTheDocument();
  });

  it('saves the changes first when the moderator agrees, then approves', async () => {
    const save = mockSave();
    const approve = vi.spyOn(meetingsApi, 'approve').mockResolvedValue({ ...meeting, status: 'approved' });
    const onApproved = vi.fn();
    renderEditor(onApproved);

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove open issue 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'I agree' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'I agree' }));

    await vi.waitFor(() => expect(onApproved).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][1].open_issues).toEqual(['Issue A', 'Issue B']);
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(approve.mock.invocationCallOrder[0]);
  });

  it('does not save two topics with the same name, and opens the second one to fix it', async () => {
    const save = mockSave();
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(within(sidebar()).getByRole('button', { name: /Bed 9/ }));
    const name = screen.getByRole('textbox', { name: 'Topic' });
    await userEvent.clear(name);
    await userEvent.type(name, 'bed 8');
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('Another topic has this name')).toBeInTheDocument();
    expect(screen.getByText('Topic 1 of 2')).toBeInTheDocument();
  });

  it('discards the changes back to the saved minutes', async () => {
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove open issue 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard' }));

    expect(openIssues()).toEqual(['Issue A', 'Issue B', 'Issue C']);
    expect(screen.getByRole('status')).toHaveTextContent('all changes saved');
  });

  it('removes the right decision on a topic page', async () => {
    const save = mockSave();
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(within(sidebar()).getByRole('button', { name: /Bed 9/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Add decision' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Text of decision 1' }), 'Start ceftriaxone');
    await userEvent.click(within(sidebar()).getByRole('button', { name: /Bed 8/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove decision 1' }));
    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));

    expect(save.mock.calls[0][1].decisions).toEqual([{ decision: 'Start ceftriaxone', time: '', patient: 'Bed 9' }]);
  });

  it('saves the changes first, then previews the email: its short note and the minutes as the PDF', async () => {
    const save = mockSave();
    const preview = vi.spyOn(meetingsApi, 'emailPreview').mockResolvedValue({
      subject: '[Medical] Medical board',
      language: 'ro',
      html: '<html><body><p>Bună ziua,</p></body></html>',
      text: 'Bună ziua,\n\nVă transmitem atașat procesul-verbal al ședinței „Medical board” din 26.09.2026.\n',
      attachment: 'Proces-verbal - Medical board - 26.09.2026.pdf',
    });
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove open issue 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview email' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(await dialog.findByText('[Medical] Medical board')).toBeInTheDocument();
    expect(dialog.getByText(/Vă transmitem atașat procesul-verbal al ședinței „Medical board”/)).toBeInTheDocument();
    // The minutes it carries: the PDF, shown as it will be attached.
    expect(dialog.getByText('Attachment: Proces-verbal - Medical board - 26.09.2026.pdf')).toBeInTheDocument();
    expect(dialog.getByTitle('The minutes (PDF)')).toHaveAttribute('src', '/api/meetings/m1/minutes.pdf');
    expect(dialog.getByRole('link', { name: 'Export PDF' })).toHaveAttribute('href', '/api/meetings/m1/minutes.pdf');
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(preview.mock.invocationCallOrder[0]);
  });

  it('exports the draft as the PDF, saving the changes first so it shows them', async () => {
    const save = vi.spyOn(meetingsApi, 'saveMinutes').mockImplementation((_, minutes) => Promise.resolve(minutes));
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    renderEditor();

    const toolbar = within(screen.getByRole('link', { name: 'Download PDF' }).closest('.mantine-Paper-root')!);
    expect(toolbar.getByRole('link', { name: 'Download PDF' })).toHaveAttribute(
      'href',
      '/api/meetings/m1/minutes.pdf?download=1',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove open issue 1' }));
    await userEvent.click(toolbar.getByRole('link', { name: 'Export PDF' }));

    await vi.waitFor(() => expect(tab.location.href).toBe('/api/meetings/m1/minutes.pdf'));
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    expect(save).toHaveBeenCalledOnce();
  });

  it('offers the moderator the full minutes, every topic with its details', async () => {
    renderEditor();
    await userEvent.click(screen.getByRole('button', { name: 'More PDF options' }));
    expect(await screen.findByRole('menuitem', { name: 'Open full details' })).toHaveAttribute(
      'href',
      '/api/meetings/m1/minutes.pdf?full=1',
    );
    expect(screen.getByRole('menuitem', { name: 'Download full details' })).toHaveAttribute(
      'href',
      '/api/meetings/m1/minutes.pdf?full=1&download=1',
    );
  });

  it('measures its toolbar once, instead of again after every render', async () => {
    // A ResizeObserver that reports a size as soon as it observes, as browsers do.
    let measured = 0;
    class Reporting {
      readonly report: ResizeObserverCallback;
      constructor(report: ResizeObserverCallback) {
        this.report = report;
      }
      observe(target: Element, options?: ResizeObserverOptions) {
        if (options?.box === 'border-box') measured += 1; // the toolbar's (other observers don't ask for a box)
        const size = [{ inlineSize: 800, blockSize: measured }];
        const entry = {
          target,
          borderBoxSize: size,
          contentBoxSize: size,
          contentRect: target.getBoundingClientRect(),
        };
        this.report([entry as unknown as ResizeObserverEntry], this);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', Reporting);
    try {
      renderEditor();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(measured).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('edits next to the email, which follows what is typed and shows the part being edited', async () => {
    const save = mockSave();
    renderEditor();

    await userEvent.click(screen.getByRole('button', { name: 'Edit with preview' }));

    const editor = within(screen.getByRole('region', { name: 'Editor' }));
    const email = within(screen.getByRole('region', { name: 'Email preview' }));
    // The email is in the minutes' own language (Romanian here), not the app's.
    expect(email.getByText('Ședință medicală · Proces-verbal')).toBeInTheDocument();
    const title = editor.getByRole('textbox', { name: 'Title' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Consiliul medical');
    expect(await email.findByRole('heading', { name: 'Consiliul medical' })).toBeInTheDocument();

    // A topic picked in the editor is marked in the email.
    await userEvent.selectOptions(editor.getByRole('combobox', { name: 'Section' }), '02 · Bed 9');
    const status = editor.getByRole('textbox', { name: 'Status' });
    await userEvent.clear(status);
    await userEvent.type(status, 'Afebrile');
    const topic = (await email.findByText('Afebrile')).closest<HTMLElement>('[data-focus]');
    expect(topic).toHaveAttribute('data-focus', 'topic:1');
    expect(topic?.style.outline).toMatch(/^2px solid/);
    expect(email.getByText('Bed 8').closest<HTMLElement>('[data-focus]')?.style.outline).toBe('');

    await userEvent.click(screen.getByRole('button', { name: /^Save/ }));
    expect(save.mock.calls[0][1].title).toBe('Consiliul medical');

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('region', { name: 'Email preview' })).not.toBeInTheDocument();
    // Back on the page, at the section that was open, with the keyboard where it was.
    expect(screen.getByRole('heading', { name: 'Bed 9' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit with preview' })).toHaveFocus();
    expect(await screen.findByText('Draft minutes · all changes saved')).toBeInTheDocument();
  });
});
