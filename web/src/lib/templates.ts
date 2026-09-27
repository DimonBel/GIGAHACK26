/** Order and built-in defaults of a meeting type's minutes template (docs/api.md). */
import type { MeetingType, MinutesTemplate, TemplateSection } from '../api/types';

export const MAX_INSTRUCTIONS_LENGTH = 1000;
export const MAX_NOTE_LENGTH = 200;

const SECTION_ORDER: TemplateSection[] = [
  'summary',
  'key_moments',
  'topics',
  'other_decisions',
  'action_items',
  'open_issues',
  'attendees',
  'participants',
  'warnings',
];

/** Off in the built-in template (like the server's OFF_BY_DEFAULT): the timeline, the voices with the roles the AI
 *  guessed and the automatic check's notes are for the moderator, not for the people who receive the minutes. */
export const OFF_BY_DEFAULT: TemplateSection[] = ['key_moments', 'participants', 'warnings'];

/** Version 0: the sections in the canonical order (the moderator-only ones off), every topic field on, no extra
 *  instructions. */
export function builtInTemplate(type: MeetingType): MinutesTemplate {
  return {
    meeting_type: type,
    version: 0,
    sections: SECTION_ORDER.map((key) => ({ key, enabled: !OFF_BY_DEFAULT.includes(key) })),
    topic_fields: { status: true, findings: true, decisions: true },
    instructions: '',
    note: '',
    created_by: null,
    created_at: null,
  };
}

/** The active template of a meeting type from `useTemplates()`'s data; the built-in default while loading, on
 *  error, or if the answer is not the expected shape — so printing and previewing never break. */
export function activeTemplate(templates: MinutesTemplate[] | undefined, type: MeetingType): MinutesTemplate {
  const found = Array.isArray(templates) ? templates.find((template) => template.meeting_type === type) : undefined;
  return found ?? builtInTemplate(type);
}
