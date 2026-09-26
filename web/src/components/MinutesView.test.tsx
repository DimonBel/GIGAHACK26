import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Minutes } from '../api/types';
import { renderWithProviders } from '../test/render';
import { MinutesView } from './MinutesView';

const minutes: Minutes = {
  title: 'Medical board 26.09',
  summary: 'Two patients were discussed.',
  suggestions: ['Repeat the blood gas tomorrow'],
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
  participants: { 'SPEAKER 1': { role: 'leads the round', name: 'Daniela', seconds: 312 } },
};

describe('MinutesView', () => {
  it('shows verification warnings prominently and the patients of a medical meeting', () => {
    renderWithProviders(<MinutesView minutes={minutes} meetingType="medical" />);

    expect(screen.getByText('Check before approving (1)')).toBeInTheDocument();
    expect(screen.getByText('[00:05] value(s) 120 not found in the transcript')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Patients' })).toBeInTheDocument();
    expect(screen.getByText('Start amikacin')).toBeInTheDocument();
    expect(screen.getByText('Daniela')).toBeInTheDocument();
  });

  it('lists action items by priority, most urgent first', () => {
    renderWithProviders(<MinutesView minutes={minutes} meetingType="medical" />);

    const table = screen.getByRole('heading', { name: 'Action items' }).closest('section');
    const rows = within(table as HTMLElement)
      .getAllByRole('row')
      .slice(1);
    expect(rows[0]).toHaveTextContent('Call urology');
    expect(rows[1]).toHaveTextContent('Order a chest X-ray');
  });

  it('calls the topics agenda items outside medical meetings', () => {
    renderWithProviders(<MinutesView minutes={{ ...minutes, warnings: [] }} meetingType="executive" />);

    expect(screen.getByRole('heading', { name: 'Agenda items' })).toBeInTheDocument();
    expect(screen.queryByText(/Check before approving/)).not.toBeInTheDocument();
  });
});
