import { describe, expect, it } from 'vitest';

import type { Minutes } from '../api/types';
import { fromFormValues, toFormValues } from './minutesForm';

const minutes: Minutes = {
  title: 'Medical board',
  summary: 'Two patients discussed.',
  suggestions: ['Check potassium tomorrow'],
  key_moments: [{ time: '04:12', moment: 'Transfer to ICU — Bed 8' }],
  topics: [{ name: 'Bed 8', time: '00:03', status: 'Stable', findings: ['BP 120/80'] }],
  decisions: [{ decision: 'Start amikacin', time: '01:32', patient: 'Bed 8' }],
  action_items: [
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
  participants: { 'SPEAKER 1': { role: 'leads the round', name: '', seconds: 312 } },
};

describe('minutes form values', () => {
  it('turns participants into rows and back without losing anything', () => {
    const values = toFormValues(minutes);
    expect(values.participants).toEqual([{ speaker: 'SPEAKER 1', role: 'leads the round', name: '', seconds: 312 }]);
    expect(fromFormValues(values)).toEqual(minutes);
  });

  it('drops rows that were added but left empty', () => {
    const values = toFormValues(minutes);
    values.suggestions.push('  ');
    values.open_issues.push('');
    values.key_moments.push({ time: '10:00', moment: '' });
    values.topics.push({ name: '', time: '', status: '', findings: [''] });
    values.topics[0].findings.push(' ');
    values.decisions.push({ decision: '', time: '', patient: 'Bed 8' });
    values.action_items.push({ task: ' ', owner: 'x', deadline: '', priority: 'low', time: '', patient: '' });

    expect(fromFormValues(values)).toEqual(minutes);
  });
});
