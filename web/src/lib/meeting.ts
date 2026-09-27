/** Meeting types, statuses, processing stages and priorities: their order, colors and labels (in the app's
 *  language; call the label functions while rendering). */
import type { MantineColor } from '@mantine/core';

import type { Meeting, MeetingStatus, MeetingType, Priority, ProgressStage } from '../api/types';
import i18n from '../i18n';

export const POLL_INTERVAL_MS = 2000;

/** How often the live processing view refreshes while it is on screen: fast enough to feel live. */
export const LIVE_POLL_INTERVAL_MS = 1000;

export const MEETING_TYPE_VALUES: MeetingType[] = ['medical', 'executive', 'administrative'];

export const MEETING_TYPE_COLORS: Record<MeetingType, MantineColor> = {
  medical: 'teal',
  executive: 'indigo',
  administrative: 'grape',
};

export const STATUS_COLORS: Record<MeetingStatus, MantineColor> = {
  queued: 'gray',
  processing: 'blue',
  ready: 'orange',
  approved: 'teal',
  sent: 'green',
  failed: 'red',
};

/** Pipeline stages in order, as shown while a meeting is processed. */
export const STAGE_ORDER: ProgressStage[] = ['queued', 'converting', 'transcribing', 'speakers', 'minutes'];

export const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export const PRIORITY_COLORS: Record<Priority, MantineColor> = { high: 'red', medium: 'yellow', low: 'gray' };

export function meetingTypeLabel(type: MeetingType): string {
  return i18n.t(`meetingType.${type}`);
}

/** The meeting types for a select. */
export function meetingTypeOptions(): { value: MeetingType; label: string }[] {
  return MEETING_TYPE_VALUES.map((value) => ({ value, label: meetingTypeLabel(value) }));
}

export function statusLabel(status: MeetingStatus): string {
  return i18n.t(`status.${status}`);
}

export function stageLabel(stage: ProgressStage): string {
  return i18n.t(`stage.${stage}`);
}

export function stageDescription(stage: ProgressStage): string {
  return i18n.t(`stageDescription.${stage}`);
}

export function priorityLabel(priority: Priority): string {
  return i18n.t(`priority.${priority}`);
}

/** Queued or processing: the meeting page polls until it is done. */
export function isProcessing(status: MeetingStatus): boolean {
  return status === 'queued' || status === 'processing';
}

/** Transcript and minutes exist. */
export function hasMinutes(status: MeetingStatus): boolean {
  return status === 'ready' || status === 'approved' || status === 'sent';
}

/** The email subject's type tag, in English whatever the language: the delivery workflow writes it so. */
const SUBJECT_TYPES: Record<MeetingType, string> = {
  medical: 'Medical',
  executive: 'Executive',
  administrative: 'Administrative',
};

/** Email subject as the delivery workflow writes it: "[Medical] Medical board 26.09". */
export function emailSubject(meeting: Pick<Meeting, 'meeting_type' | 'title'>, fallbackTitle = ''): string {
  return `[${SUBJECT_TYPES[meeting.meeting_type]}] ${meeting.title || fallbackTitle}`.trim();
}
