import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { templatesApi } from '../api/endpoints';
import type { Minutes, MinutesTemplate } from '../api/types';
import { renderWithProviders } from '../test/render';
import { MinutesView } from './MinutesView';

const minutes: Minutes = {
  title: 'Medical board 26.09',
  summary: 'Two patients were discussed.',
  key_moments: [{ time: '04:12', moment: 'Transfer to ICU — Bed 8' }],
  topics: [
    { name: 'Bed 8', time: '00:03', status: 'Stable after surgery', findings: ['BP 120/80'] },
    { name: 'Bed 9', time: '06:10', status: 'Fever', findings: [] },
  ],
  decisions: [{ decision: 'Start amikacin', time: '01:32', patient: 'Bed 8' }],
  action_items: [
    {
      task: 'Order a chest X-ray',
      owner: 'Nurse',
      deadline: 'tomorrow',
      priority: 'low',
      time: '07:00',
      patient: 'Bed 9',
    },
    {
      task: 'Call urology',
      owner: 'Dr. Butnari',
      deadline: 'today',
      priority: 'high',
      time: '05:36',
      patient: 'Bed 8',
    },
  ],
  open_issues: ['Bed 9: culture pending'],
  warnings: ['[00:05] value(s) 120 not found in the transcript'],
  attendees: [],
  participants: { 'SPEAKER 1': { role: 'leads the round', name: 'Daniela', seconds: 312 } },
};

const ALL_SECTIONS: MinutesTemplate['sections'] = [
  { key: 'summary', enabled: true },
  { key: 'key_moments', enabled: true },
  { key: 'topics', enabled: true },
  { key: 'other_decisions', enabled: true },
  { key: 'action_items', enabled: true },
  { key: 'open_issues', enabled: true },
  { key: 'attendees', enabled: true },
  { key: 'participants', enabled: true },
  { key: 'warnings', enabled: true },
];

function template(sections: MinutesTemplate['sections'] = ALL_SECTIONS): MinutesTemplate {
  return {
    meeting_type: 'medical',
    version: 1,
    sections,
    topic_fields: { status: true, findings: true, decisions: true },
    instructions: '',
    note: '',
    created_by: null,
    created_at: null,
  };
}

const meeting = {
  title: 'Consiliu medical',
  created_at: '2026-09-26T08:05:00Z',
  duration_s: 4210,
  approved_by: { id: 2, full_name: 'Dr. Butnari' },
};

describe('MinutesView', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads as minutes: no minute marks, no timeline, no notes of the automatic check by default', () => {
    renderWithProviders(<MinutesView minutes={minutes} meetingType="medical" />);

    expect(screen.getByRole('heading', { name: 'Medical board 26.09' })).toBeInTheDocument();
    expect(screen.getByText('Medical meeting · Minutes')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Topics' })).toBeInTheDocument();
    expect(screen.getByText('Start amikacin')).toBeInTheDocument();
    // The built-in template leaves the timeline, the voices and the check's notes to the moderator.
    for (const hidden of ['Key moments', 'Participants', 'Verification notes']) {
      expect(screen.queryByRole('heading', { name: hidden })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/\d\d:\d\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bAI\b|server/i)).not.toBeInTheDocument();
  });

  it('leaves out the notes for the moderator, as the email does', () => {
    const noted = {
      ...minutes,
      decisions: [{ decision: 'Start amikacin ⚠ unverified: 2 g', time: '', patient: 'Bed 8' }],
    };
    renderWithProviders(<MinutesView minutes={noted} meetingType="medical" />);

    expect(screen.getByText('Start amikacin')).toBeInTheDocument();
    expect(screen.queryByText(/unverified/)).not.toBeInTheDocument();
  });

  it('writes the meeting, when it was held, how long and who approved it under the title', () => {
    renderWithProviders(<MinutesView minutes={minutes} meetingType="medical" meeting={meeting} />);

    const held = new Date(meeting.created_at);
    const pad = (value: number) => String(value).padStart(2, '0');
    const date = `${pad(held.getDate())}.${pad(held.getMonth() + 1)}.${held.getFullYear()}`;
    expect(
      screen.getByText(`Consiliu medical · ${date} ${pad(held.getHours())}:05 · 1 h 10 min · approved by Dr. Butnari`),
    ).toBeInTheDocument();
  });

  it('lists action items by priority, most urgent first, without a time column', () => {
    renderWithProviders(<MinutesView minutes={minutes} meetingType="medical" />);

    const table = screen.getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['#', 'Task', 'Topic', 'Owner', 'Deadline', 'Priority']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Call urology');
    expect(rows[0]).toHaveTextContent(/high$/);
    expect(rows[1]).toHaveTextContent('Order a chest X-ray');
  });

  it('shows the minutes language, not the app language, and lists who attended', () => {
    const attendees: Minutes['attendees'] = [
      { user_id: 1, name: 'Ana Popescu', job_title: 'Head of cardiology', position: 'Doctor', specialty: 'Cardiology' },
    ];
    renderWithProviders(<MinutesView minutes={{ ...minutes, attendees }} meetingType="medical" language="ro" />);

    expect(screen.getByText('Ședință medicală · Proces-verbal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Rezumat' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Subiecte' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Prezenți' })).toBeInTheDocument();
    expect(screen.getByText('Ana Popescu — Head of cardiology, Doctor, Cardiology')).toBeInTheDocument();
    expect(screen.getByText('ridicată')).toBeInTheDocument();
    // The app stays in English: this component alone follows the minutes' own language.
    expect(screen.queryByText('Summary')).not.toBeInTheDocument();
  });

  it('shows the sections a template turns on, the check notes without their minute mark', () => {
    render(template(ALL_SECTIONS));

    expect(screen.getByRole('heading', { name: 'Key moments' })).toBeInTheDocument();
    expect(screen.getByText('Transfer to ICU — Bed 8')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Participants' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Verification notes' })).toBeInTheDocument();
    expect(screen.getByText('value(s) 120 not found in the transcript')).toBeInTheDocument();
    expect(screen.queryByText(/00:05/)).not.toBeInTheDocument();
  });

  it('hides a section the active template disables', async () => {
    vi.spyOn(templatesApi, 'list').mockResolvedValue([
      template(ALL_SECTIONS.map((section) => (section.key === 'summary' ? { ...section, enabled: false } : section))),
    ]);

    renderWithProviders(<MinutesView minutes={minutes} meetingType="medical" />);

    // The fallback (built-in) template renders first, with the summary: wait for the fetched template to take over.
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Summary' })).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Key moments' })).toBeInTheDocument();
  });

  it("follows the template's section order", () => {
    render(
      template([
        { key: 'topics', enabled: true },
        { key: 'summary', enabled: true },
        { key: 'key_moments', enabled: true },
        ...ALL_SECTIONS.filter((section) => !['topics', 'summary', 'key_moments'].includes(section.key)),
      ]),
    );

    const titles = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(titles.indexOf('Topics')).toBeLessThan(titles.indexOf('Summary'));
    expect(titles.indexOf('Summary')).toBeLessThan(titles.indexOf('Key moments'));
  });
});

function render(layout: MinutesTemplate) {
  return renderWithProviders(<MinutesView minutes={minutes} meetingType="medical" template={layout} />);
}
