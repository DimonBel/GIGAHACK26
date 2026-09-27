import { Badge, Group, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import type { MeetingStatus, MeetingType, Priority, Role } from '../api/types';
import { LANGUAGE_COLORS, languageLabel } from '../lib/languages';
import { MEETING_TYPE_COLORS, PRIORITY_COLORS, STATUS_COLORS } from '../lib/meeting';
import { ROLE_COLORS } from '../lib/roles';

export function MeetingStatusBadge({ status }: { status: MeetingStatus }) {
  const { t } = useTranslation();
  return (
    <Badge color={STATUS_COLORS[status]} variant="light">
      {t(`status.${status}`)}
    </Badge>
  );
}

export function MeetingTypeBadge({ type }: { type: MeetingType }) {
  const { t } = useTranslation();
  return (
    <Badge color={MEETING_TYPE_COLORS[type]} variant="outline">
      {t(`meetingType.${type}`)}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useTranslation();
  return (
    <Badge color={PRIORITY_COLORS[priority]} variant="light" size="sm">
      {t(`priority.${priority}`)}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const { t } = useTranslation();
  return (
    <Badge color={ROLE_COLORS[role]} variant="light">
      {t(`role.${role}`)}
    </Badge>
  );
}

/** "RO", "RU", "EN" tags of the languages spoken in an utterance. */
export function LanguageBadges({ languages }: { languages: string[] }) {
  useTranslation(); // the tooltips follow the app's language
  return (
    <Group gap={4} wrap="nowrap">
      {languages.map((code) => (
        <Tooltip key={code} label={languageLabel(code)} withinPortal>
          <Badge size="xs" variant="light" color={LANGUAGE_COLORS[code] ?? 'gray'} aria-label={languageLabel(code)}>
            {code}
          </Badge>
        </Tooltip>
      ))}
    </Group>
  );
}
