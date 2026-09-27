import { describe, expect, it } from 'vitest';

import type { Minutes } from '../api/types';
import { fromFormValues, toFormValues, topicNameError, withoutEmptyRows } from './minutesForm';

const minutes: Minutes = {
  title: 'Medical board',
  summary: 'Two patients discussed.',
  key_moments: [{ time: '04:12', moment: 'Transfer to ICU — Bed 8' }],
  topics: [{ name: 'Bed 8', time: '00:03', status: 'Stable', findings: ['BP 120/80'] }],
  decisions: [
    { decision: 'Start amikacin', time: '01:32', patient: 'Bed 8' },
    { decision: 'Order more gloves', time: '09:10', patient: '' },
  ],
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
  attendees: [],
  participants: { 'SPEAKER 1': { role: 'leads the round', name: '', seconds: 312 } },
};

describe('minutes form values', () => {
  it('turns participants into rows and back without losing anything', () => {
    const values = toFormValues(minutes);
    expect(values.participants).toEqual([{ speaker: 'SPEAKER 1', role: 'leads the round', name: '', seconds: 312 }]);
    expect(fromFormValues(values)).toEqual(minutes);
  });

  it('attaches decisions and action items to their topic by key', () => {
    const values = toFormValues(minutes);
    const key = values.topics[0].key;
    expect(values.decisions.map((row) => row.topic)).toEqual([key, '']);
    expect(values.action_items[0].topic).toBe(key);
  });

  it('keeps decisions and action items with a renamed topic', () => {
    const values = toFormValues(minutes);
    values.topics[0].name = ' Bed 8A ';

    const saved = fromFormValues(values);
    expect(saved.topics[0].name).toBe('Bed 8A');
    expect(saved.decisions[0].patient).toBe('Bed 8A');
    expect(saved.action_items[0].patient).toBe('Bed 8A');
  });

  it('keeps what the LLM wrote for rows that belong to none of the topics', () => {
    const values = toFormValues({ ...minutes, decisions: [{ decision: 'Discharge', time: '', patient: 'Bed 12' }] });
    expect(values.decisions[0].topic).toBe('');
    expect(fromFormValues(values).decisions[0].patient).toBe('Bed 12');
  });

  it('drops rows that were added but left empty', () => {
    const values = toFormValues(minutes);
    values.open_issues.push('');
    values.key_moments.push({ time: '10:00', moment: '' });
    values.topics.push({ key: 'new', name: '', time: '', status: '', findings: [''] });
    values.topics[0].findings.push(' ');
    values.decisions.push({ decision: '', time: '', patient: '', topic: values.topics[0].key });
    values.action_items.push({
      task: ' ',
      owner: 'x',
      deadline: '',
      priority: 'low',
      time: '',
      patient: '',
      topic: '',
    });

    expect(fromFormValues(values)).toEqual(minutes);
  });

  it('drops an empty topic but keeps one that still has decisions', () => {
    const values = toFormValues(minutes);
    values.topics.push({ key: 'blank', name: ' ', time: '', status: '', findings: [''] });
    values.topics.push({ key: 'unnamed', name: '', time: '', status: '', findings: [] });
    values.decisions.push({ decision: 'Ask pharmacy', time: '', patient: '', topic: 'unnamed' });

    expect(withoutEmptyRows(values).topics.map((topic) => topic.key)).toEqual([values.topics[0].key, 'unnamed']);
  });

  it('asks for a name of its own for every topic with content', () => {
    const values = toFormValues(minutes);
    values.topics.push({ key: 'twin', name: ' bed 8', time: '', status: 'Seen again', findings: [] });
    values.topics.push({ key: 'unnamed', name: '', time: '', status: '', findings: [] });
    values.topics.push({ key: 'blank', name: '', time: '', status: '', findings: [] });
    values.decisions.push({ decision: 'Ask pharmacy', time: '', patient: '', topic: 'unnamed' });

    expect(values.topics.map((_, index) => topicNameError(values, index))).toEqual([
      'Another topic has this name',
      'Another topic has this name',
      'Give the topic a name',
      null,
    ]);
  });

  it('attaches rows to a topic whatever the case and spaces of its name', () => {
    const values = toFormValues({
      ...minutes,
      decisions: [{ decision: 'Start amikacin', time: '', patient: ' bed 8 ' }],
    });
    expect(values.decisions[0].topic).toBe(values.topics[0].key);
  });

  it('keeps attendees, from the directory and from outside it, and drops one added but left unnamed', () => {
    const attendees: Minutes['attendees'] = [
      { user_id: 3, name: 'Ana Popescu', job_title: 'Head of cardiology', position: 'Doctor', specialty: 'Cardiology' },
      { user_id: null, name: 'Ion Vasile', job_title: 'Family member', position: '', specialty: '' },
    ];
    const values = toFormValues({ ...minutes, attendees });
    expect(values.attendees).toEqual(attendees);

    values.attendees.push({ user_id: null, name: '', job_title: '', position: '', specialty: '' });
    expect(fromFormValues(values).attendees).toEqual(attendees);
  });
});
