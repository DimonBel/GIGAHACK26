import { Badge, Group, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { priorityRank } from '../../lib/minutesDoc';
import type { ActionRow } from '../../lib/minutesForm';
import { useMinutesDocument } from './context';
import { TaskEditRows, TaskList } from './parts';

type Grouping = 'priority' | 'owner';

/** The action items by who does them (a person or a whole team): owners alphabetically, then those without one. */
function byOwner(tasks: ActionRow[]): [string, ActionRow[]][] {
  const groups = new Map<string, { name: string; rows: ActionRow[] }>();
  for (const task of tasks) {
    const name = task.owner.trim();
    const key = name.toLowerCase();
    const group = groups.get(key) ?? { name, rows: [] };
    group.rows.push(task);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => (!a.name ? 1 : !b.name ? -1 : a.name.localeCompare(b.name)))
    .map(({ name, rows }) => [name, rows]);
}

/** Every action item of the meeting, most urgent first or by who does them. */
export function TasksSection() {
  const { t } = useTranslation('minutes');
  const { values, form } = useMinutesDocument();
  const [grouping, setGrouping] = useState<Grouping>('priority');
  const tasks = [...values.action_items].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" gap="sm">
        <Stack gap={6}>
          <Title order={2}>{t('labels.actionItems')}</Title>
          <Text size="sm" c="dimmed">
            {form ? t('tasks.descriptionEdit') : t('tasks.descriptionView')}
          </Text>
        </Stack>
        {!form && tasks.length > 0 && (
          <SegmentedControl
            size="xs"
            value={grouping}
            onChange={(value) => setGrouping(value)}
            aria-label={t('tasks.show')}
            data={[
              { value: 'priority', label: t('tasks.byPriority') },
              { value: 'owner', label: t('tasks.byOwner') },
            ]}
          />
        )}
      </Group>
      {form ? (
        <TaskEditRows which={() => true} newTopic="" />
      ) : !tasks.length ? (
        <Text size="sm" c="dimmed">
          {t('tasks.empty')}
        </Text>
      ) : grouping === 'priority' ? (
        <TaskList rows={tasks} withTopic />
      ) : (
        <Stack gap="lg">
          {byOwner(tasks).map(([name, rows]) => (
            <Stack key={name || '-'} gap={4}>
              <Group gap="xs">
                <Title order={3} size="h5" c={name ? undefined : 'dimmed'}>
                  {name || t('tasks.unassigned')}
                </Title>
                <Badge size="sm" variant="light" color="gray">
                  {rows.length}
                </Badge>
              </Group>
              <TaskList rows={rows} withTopic />
            </Stack>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
