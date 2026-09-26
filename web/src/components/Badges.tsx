import { Badge, Group, Tooltip } from '@mantine/core';

import type { MeetingStatus, MeetingType, Priority, Role } from '../api/types';
import { languageLabel, LANGUAGES } from '../lib/languages';
import { MEETING_TYPE_COLORS, meetingTypeLabel, PRIORITY_COLORS, STATUS_META } from '../lib/meeting';
import { ROLE_COLORS, roleLabel } from '../lib/roles';

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  const { label, color } = STATUS_META[status];
  return (
    <Badge color={color} variant="light">
      {label}
    </Badge>
  );
}

export function MeetingTypeBadge({ type }: { type: MeetingType }) {
  return (
    <Badge color={MEETING_TYPE_COLORS[type]} variant="outline">
      {meetingTypeLabel(type)}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge color={PRIORITY_COLORS[priority]} variant="light" size="sm">
      {priority}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <Badge color={ROLE_COLORS[role]} variant="light">
      {roleLabel(role)}
    </Badge>
  );
}

/** "RO", "RU", "EN" tags of the languages spoken in an utterance. */
export function LanguageBadges({ languages }: { languages: string[] }) {
  return (
    <Group gap={4} wrap="nowrap">
      {languages.map((code) => (
        <Tooltip key={code} label={languageLabel(code)} withinPortal>
          <Badge size="xs" variant="light" color={LANGUAGES[code]?.color ?? 'gray'} aria-label={languageLabel(code)}>
            {code}
          </Badge>
        </Tooltip>
      ))}
    </Group>
  );
}
