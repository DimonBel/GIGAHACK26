import { describe, expect, it } from 'vitest';

import type { Minutes, Utterance } from '../api/types';
import { attendeeDetails, forRecipients, lineAt, speakerName, timeToSeconds, topicAt, topicLines } from './minutesDoc';
import type { TopicRow } from './minutesForm';

const topic = (key: string, time: string): TopicRow => ({ key, name: key, time, status: '', findings: [] });
const line = (start: number, end: number, text: string): Utterance => ({
  start,
  end,
  speaker: 'SPEAKER 1',
  languages: ['ro'],
  text,
});

describe('minutes document helpers', () => {
  it.each(['⚠ unverified: 240, 2 g', '⚠ de verificat: 240, 2 g', '⚠ не проверено: 240, 2 g'])(
    'leaves the note "%s" for the moderator out of what recipients read',
    (note) => {
      const minutes = {
        topics: [{ name: 'Bed 9', time: '', status: `Stable ${note}; fever`, findings: [`Creatinine 240 ${note}`] }],
        decisions: [{ decision: `Start 2 g ${note}`, time: '', patient: 'Bed 9' }],
        action_items: [{ task: `Recheck ${note}`, owner: '', deadline: '', priority: 'high', time: '', patient: '' }],
      } as unknown as Minutes;

      const clean = forRecipients(minutes);

      expect(clean.topics[0]).toMatchObject({ status: 'Stable; fever', findings: ['Creatinine 240'] });
      expect(clean.decisions[0].decision).toBe('Start 2 g');
      expect(clean.action_items[0].task).toBe('Recheck');
      expect(minutes.topics[0].findings[0]).toContain(note);
    },
  );

  it('reads times of the minutes, also a warning prefix', () => {
    expect(timeToSeconds('04:12')).toBe(252);
    expect(timeToSeconds('1:02:05')).toBe(3725);
    expect(timeToSeconds('75:00')).toBe(4500);
    expect(timeToSeconds('[07:15] value(s) 3 not found')).toBe(435);
    expect(timeToSeconds('')).toBeNull();
    expect(timeToSeconds('tomorrow')).toBeNull();
  });

  it('finds the topic discussed at a time', () => {
    const topics = [topic('bed 9', '06:10'), topic('bed 8', '00:03'), topic('no time', '')];
    expect(topicAt(topics, 1)).toBe(-1);
    expect(topicAt(topics, 5 * 60)).toBe(1);
    expect(topicAt(topics, 7 * 60)).toBe(0);
  });

  it("gives a topic the lines from its time until the next topic's", () => {
    const topics = [topic('bed 8', '00:03'), topic('bed 9', '00:20')];
    const lines = [line(0, 2, 'Hello'), line(2, 10, 'Bed 8 is stable'), line(12, 19, 'OK'), line(20, 25, 'Bed 9')];
    expect(topicLines(lines, topics, 0).map((l) => l.text)).toEqual(['Bed 8 is stable', 'OK']);
    expect(topicLines(lines, topics, 1).map((l) => l.text)).toEqual(['Bed 9']);
    expect(lineAt(topicLines(lines, topics, 0), 13)).toBe(1);
  });

  it('names a voice the way the moderator did', () => {
    const participants = [{ speaker: 'SPEAKER 1', role: '', name: 'Dr. Rusu', seconds: 5 }];
    expect(speakerName(participants, 'SPEAKER 1')).toBe('Dr. Rusu');
    expect(speakerName(participants, 'SPEAKER 2')).toBe('Speaker 2');
  });

  it('joins an attendee’s job title, position and specialty, skipping empty parts', () => {
    expect(attendeeDetails({ job_title: 'Head of cardiology', position: 'Doctor', specialty: 'Cardiology' })).toBe(
      'Head of cardiology · Doctor · Cardiology',
    );
    expect(attendeeDetails({ job_title: 'Family member', position: '', specialty: '' })).toBe('Family member');
    expect(attendeeDetails({ job_title: '', position: '', specialty: '' })).toBe('');
    expect(
      attendeeDetails({ job_title: 'Head of cardiology', position: 'Doctor', specialty: 'Cardiology' }, ', '),
    ).toBe('Head of cardiology, Doctor, Cardiology');
  });
});
