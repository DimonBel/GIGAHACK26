/** Minutes as editable form values and back. Topics get keys, and decisions and action items point to their topic by
 *  key, so renaming a topic keeps them attached. */
import type { ActionItem, Decision, Minutes, Participant, Topic } from '../api/types';
import i18n from '../i18n';

export interface TopicRow extends Topic {
  key: string;
}

/** A decision with the key of its topic ('' when it belongs to none of the topics). */
export interface DecisionRow extends Decision {
  topic: string;
}

export interface ActionRow extends ActionItem {
  topic: string;
}

export interface ParticipantRow extends Participant {
  speaker: string;
}

export interface MinutesFormValues extends Omit<Minutes, 'topics' | 'decisions' | 'action_items' | 'participants'> {
  topics: TopicRow[];
  decisions: DecisionRow[];
  action_items: ActionRow[];
  participants: ParticipantRow[];
}

let lastKey = 0;

/** A key for a topic, unique on this page. */
export function newTopicKey(): string {
  lastKey += 1;
  return `topic-${lastKey}`;
}

const filled = (value: string) => value.trim() !== '';
/** Names as they are compared: "bed 8 " is "Bed 8". */
const sameName = (name: string) => name.trim().toLowerCase();

/** A deep copy: the form must never change the cached minutes it was filled from. */
export function toFormValues(minutes: Minutes): MinutesFormValues {
  const copy = structuredClone(minutes);
  const topics = copy.topics.map((topic) => ({ ...topic, key: newTopicKey() }));
  const keys = new Map<string, string>();
  for (const topic of topics) {
    if (filled(topic.name) && !keys.has(sameName(topic.name))) keys.set(sameName(topic.name), topic.key);
  }
  const topicOf = (patient: string) => keys.get(sameName(patient)) ?? '';
  return {
    ...copy,
    topics,
    decisions: copy.decisions.map((decision) => ({ ...decision, topic: topicOf(decision.patient) })),
    action_items: copy.action_items.map((item) => ({ ...item, topic: topicOf(item.patient) })),
    participants: Object.entries(copy.participants).map(([speaker, participant]) => ({ speaker, ...participant })),
  };
}

/** The topic has something to save: a name, a status, findings, decisions or action items. */
function hasContent(values: MinutesFormValues, topic: TopicRow): boolean {
  return (
    filled(topic.name) ||
    filled(topic.status) ||
    topic.findings.some(filled) ||
    values.decisions.some((row) => row.topic === topic.key && filled(row.decision)) ||
    values.action_items.some((row) => row.topic === topic.key && filled(row.task))
  );
}

/** Why the topic at index can't be saved: its decisions and action items are saved under its name, so every topic
 *  with content needs a name of its own. null: it can. */
export function topicNameError(values: MinutesFormValues, index: number): string | null {
  const topic = values.topics[index];
  if (!filled(topic.name)) return hasContent(values, topic) ? i18n.t('minutes:topic.nameRequired') : null;
  const twin = values.topics.some((other, i) => i !== index && sameName(other.name) === sameName(topic.name));
  return twin ? i18n.t('minutes:topic.duplicateName') : null;
}

/** The values as they are saved: rows the moderator added but left empty are dropped, so the email has no blank
 *  bullets; decisions and action items of a dropped topic belong to no topic. */
export function withoutEmptyRows(values: MinutesFormValues): MinutesFormValues {
  const topics = values.topics
    .filter((topic) => hasContent(values, topic))
    .map((topic) => ({ ...topic, findings: topic.findings.filter(filled) }));
  const kept = new Set(topics.map((topic) => topic.key));
  const attached = <T extends { topic: string }>(row: T): T => (kept.has(row.topic) ? row : { ...row, topic: '' });
  return {
    ...values,
    open_issues: values.open_issues.filter(filled),
    warnings: values.warnings.filter(filled),
    key_moments: values.key_moments.filter((moment) => filled(moment.moment)),
    topics,
    decisions: values.decisions.filter((decision) => filled(decision.decision)).map(attached),
    action_items: values.action_items.filter((item) => filled(item.task)).map(attached),
  };
}

/** Minutes to save. */
export function fromFormValues(values: MinutesFormValues): Minutes {
  const clean = withoutEmptyRows(values);
  const names = new Map(clean.topics.map((topic) => [topic.key, topic.name.trim()]));
  // A row of a topic takes the topic's (possibly renamed) name; a row of no topic keeps what the LLM wrote.
  const patient = (row: DecisionRow | ActionRow) => (row.topic ? (names.get(row.topic) ?? '') : row.patient);
  const topic = (row: TopicRow): Topic => ({
    name: row.name.trim(),
    time: row.time,
    status: row.status,
    findings: row.findings,
  });
  const decision = (row: DecisionRow): Decision => ({ decision: row.decision, time: row.time, patient: patient(row) });
  const actionItem = (row: ActionRow): ActionItem => ({
    task: row.task,
    owner: row.owner,
    ...(row.owner_user_id !== undefined && { owner_user_id: row.owner_user_id }),
    deadline: row.deadline,
    priority: row.priority,
    time: row.time,
    patient: patient(row),
  });
  return {
    title: clean.title,
    summary: clean.summary,
    key_moments: clean.key_moments,
    topics: clean.topics.map(topic),
    decisions: clean.decisions.map(decision),
    action_items: clean.action_items.map(actionItem),
    open_issues: clean.open_issues,
    warnings: clean.warnings,
    attendees: clean.attendees.filter((attendee) => filled(attendee.name)),
    participants: Object.fromEntries(clean.participants.map(({ speaker, ...participant }) => [speaker, participant])),
  };
}
