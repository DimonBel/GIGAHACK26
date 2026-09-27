/** Where things are in the minutes: times, the topic discussed at a time, its transcript lines, the voices. */
import type { MantineColor } from '@mantine/core';

import type { Attendee, Minutes, Priority, TemplateSection, Utterance } from '../api/types';
import i18n from '../i18n';
import { PRIORITIES } from './meeting';
import type { ParticipantRow, TopicRow } from './minutesForm';

const SPEAKER_COLORS: MantineColor[] = ['blue', 'grape', 'orange', 'teal', 'pink', 'lime', 'indigo', 'cyan', 'red'];
// The note the minutes builder appends to a value it could not find in the transcript ("⚠ de verificat: 2 g"): for
// the moderator; it ends at the next part of a status ("; ") or at the end of the text (stt/minutes/markdown.py).
const UNVERIFIED = /\s*⚠ (?:unverified|de verificat|не проверено): [^;⚠\n]*/g;

/** The part being edited next to the view: a section, or a topic by its place in the minutes. */
export type MinutesViewFocus = { section: TemplateSection } | { topic: number };

/** The key of the part being edited, as its data-focus: "summary", "topic:2"; "" for none. */
export function focusKey(focus: MinutesViewFocus | undefined): string {
  return !focus ? '' : 'topic' in focus ? `topic:${focus.topic}` : focus.section;
}

/** The minutes as the people who receive them read them: without the builder's "⚠ unverified" notes. */
export function forRecipients(minutes: Minutes): Minutes {
  const clean = (text: string) => text.replace(UNVERIFIED, '');
  return {
    ...minutes,
    topics: minutes.topics.map((topic) => ({
      ...topic,
      status: clean(topic.status),
      findings: topic.findings.map(clean),
    })),
    decisions: minutes.decisions.map((decision) => ({ ...decision, decision: clean(decision.decision) })),
    action_items: minutes.action_items.map((item) => ({ ...item, task: clean(item.task) })),
  };
}

/** "04:12", "1:02:05" or a warning's "[04:12] ..." as seconds; null without a time. */
export function timeToSeconds(time: string): number | null {
  const match = /^\[?(?:(\d+):)?(\d+):(\d{2})\b/.exec(time.trim());
  if (!match) return null;
  const [, hours = '0', minutes, seconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/** Index of the topic discussed at a time: the last one to start at or before it; -1 before the first. */
export function topicAt(topics: TopicRow[], seconds: number): number {
  let found = -1;
  let foundStart = -Infinity;
  topics.forEach((topic, index) => {
    const start = timeToSeconds(topic.time);
    if (start !== null && start <= seconds && start > foundStart) {
      found = index;
      foundStart = start;
    }
  });
  return found;
}

/** When a topic was discussed: from its time until the next topic starts; null without a time. */
export function topicRange(topics: TopicRow[], index: number): { start: number; end: number } | null {
  const start = timeToSeconds(topics[index]?.time ?? '');
  if (start === null) return null;
  const later = topics.map((topic) => timeToSeconds(topic.time)).filter((time) => time !== null && time > start);
  return { start, end: later.length ? Math.min(...(later as number[])) : Infinity };
}

/** The transcript lines of a topic: from its time until the next topic starts. */
export function topicLines(utterances: Utterance[], topics: TopicRow[], index: number): Utterance[] {
  const range = topicRange(topics, index);
  return range ? utterances.filter((line) => line.end > range.start && line.start < range.end) : [];
}

/** Index of the line being said at a time: the last one that started before it. */
export function lineAt(lines: Utterance[], seconds: number): number {
  return lines.findLastIndex((line) => line.start <= seconds + 0.5);
}

/** Sort position of a priority; an unknown one goes last. */
export function priorityRank(priority: Priority): number {
  const rank = PRIORITIES.findIndex((known) => known === priority);
  return rank < 0 ? PRIORITIES.length : rank;
}

/** A stable color per speaker label ("SPEAKER 3" is always the same color). */
export function speakerColor(speaker: string): MantineColor {
  const number = Number(/\d+/.exec(speaker)?.[0] ?? 0);
  return SPEAKER_COLORS[Math.max(0, number - 1) % SPEAKER_COLORS.length];
}

/** "SPEAKER 2" in the app's language: "Speaker 2" (also "Vorbitor 2", "Говорящий 2"). */
export function speakerLabel(speaker: string): string {
  const number = /\d+/.exec(speaker)?.[0];
  return number ? i18n.t('minutes:participants.speakerFallback', { number }) : speaker;
}

/** "SPEAKER 2" as people read it: the name the moderator gave that voice, else its localized label. */
export function speakerName(participants: ParticipantRow[], speaker: string): string {
  const named = participants.find((participant) => participant.speaker === speaker)?.name.trim();
  return named || speakerLabel(speaker);
}

/** "job title · position · specialty" (or "job title, position, specialty" for the email), the parts that
 *  aren't empty. */
export function attendeeDetails(
  attendee: Pick<Attendee, 'job_title' | 'position' | 'specialty'>,
  separator = ' · ',
): string {
  return [attendee.job_title, attendee.position, attendee.specialty].filter((part) => part.trim()).join(separator);
}
