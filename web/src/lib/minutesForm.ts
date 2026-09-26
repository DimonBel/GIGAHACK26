/** Minutes as editable form values and back. */
import type { Minutes, Participant } from '../api/types';

export interface ParticipantRow extends Participant {
  speaker: string;
}

export interface MinutesFormValues extends Omit<Minutes, 'participants'> {
  participants: ParticipantRow[];
}

const filled = (value: string) => value.trim() !== '';

/** A deep copy: the form must never change the cached minutes it was filled from. */
export function toFormValues(minutes: Minutes): MinutesFormValues {
  const copy = structuredClone(minutes);
  return {
    ...copy,
    participants: Object.entries(copy.participants).map(([speaker, participant]) => ({ speaker, ...participant })),
  };
}

/** Minutes to save: rows the moderator added but left empty are dropped, so the email has no blank bullets. */
export function fromFormValues(values: MinutesFormValues): Minutes {
  const { participants, ...minutes } = values;
  return {
    ...minutes,
    suggestions: minutes.suggestions.filter(filled),
    open_issues: minutes.open_issues.filter(filled),
    warnings: minutes.warnings.filter(filled),
    key_moments: minutes.key_moments.filter((moment) => filled(moment.moment)),
    topics: minutes.topics
      .map((topic) => ({ ...topic, findings: topic.findings.filter(filled) }))
      .filter((topic) => filled(topic.name) || filled(topic.status) || topic.findings.length > 0),
    decisions: minutes.decisions.filter((decision) => filled(decision.decision)),
    action_items: minutes.action_items.filter((item) => filled(item.task)),
    participants: Object.fromEntries(participants.map(({ speaker, ...participant }) => [speaker, participant])),
  };
}
