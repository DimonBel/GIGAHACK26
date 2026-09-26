/** Meeting types, statuses and processing stages with their labels and colors. */
import type { MantineColor } from '@mantine/core';

import type { Meeting, MeetingStatus, MeetingType, Priority, ProgressStage } from '../api/types';

export const POLL_INTERVAL_MS = 2000;

export const MEETING_TYPES: { value: MeetingType; label: string }[] = [
  { value: 'medical', label: 'Medical' },
  { value: 'executive', label: 'Executive' },
  { value: 'administrative', label: 'Administrative' },
];

export const MEETING_TYPE_COLORS: Record<MeetingType, MantineColor> = {
  medical: 'cyan',
  executive: 'indigo',
  administrative: 'grape',
};

export const STATUS_META: Record<MeetingStatus, { label: string; color: MantineColor }> = {
  queued: { label: 'Queued', color: 'gray' },
  processing: { label: 'Processing', color: 'blue' },
  ready: { label: 'Draft ready', color: 'orange' },
  approved: { label: 'Approved', color: 'teal' },
  sent: { label: 'Sent', color: 'green' },
  failed: { label: 'Failed', color: 'red' },
};

/** Pipeline stages in order, as shown while a meeting is processed. */
export const STAGES: { value: ProgressStage; label: string; description: string }[] = [
  { value: 'queued', label: 'Queued', description: 'Waiting for the meeting before it' },
  { value: 'converting', label: 'Converting', description: 'Preparing the audio' },
  { value: 'transcribing', label: 'Transcribing', description: 'Speech to text: ro / ru / en' },
  { value: 'speakers', label: 'Speakers', description: 'Who said what' },
  { value: 'minutes', label: 'Minutes', description: 'The local LLM writes the draft' },
];

export const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export const PRIORITY_COLORS: Record<Priority, MantineColor> = { high: 'red', medium: 'yellow', low: 'gray' };

export function meetingTypeLabel(type: MeetingType): string {
  return MEETING_TYPES.find((option) => option.value === type)?.label ?? type;
}

/** Queued or processing: the meeting page polls until it is done. */
export function isProcessing(status: MeetingStatus): boolean {
  return status === 'queued' || status === 'processing';
}

/** Transcript and minutes exist. */
export function hasMinutes(status: MeetingStatus): boolean {
  return status === 'ready' || status === 'approved' || status === 'sent';
}

/** Heading for the discussed items: patients in a medical meeting, agenda items otherwise. */
export function topicsLabel(type: MeetingType): string {
  return type === 'medical' ? 'Patients' : 'Agenda items';
}

export function topicLabel(type: MeetingType): string {
  return type === 'medical' ? 'Patient' : 'Item';
}

/** Email subject as the delivery workflow writes it: "[Medical] Medical board 26.09". */
export function emailSubject(meeting: Pick<Meeting, 'meeting_type' | 'title'>, fallbackTitle = ''): string {
  return `[${meetingTypeLabel(meeting.meeting_type)}] ${meeting.title || fallbackTitle}`.trim();
}
