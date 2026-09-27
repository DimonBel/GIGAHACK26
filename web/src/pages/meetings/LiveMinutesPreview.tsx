import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { IconGavel, IconListCheck, type Icon } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import type { LiveProcessing } from '../../api/types';
import { useCountUp } from '../../hooks/useCountUp';

/** How many topic chips get a staggered entrance delay before the rest pop in together. */
const STAGGERED_CHIPS = 10;

function CountStat({
  icon: StatIcon,
  label,
  value,
  color,
}: {
  icon: Icon;
  label: string;
  value: number;
  color: string;
}) {
  const count = useCountUp(value);
  return (
    <Group gap={8} wrap="nowrap">
      <StatIcon size={18} className={`live-count-icon live-count-icon-${color}`} aria-hidden="true" />
      <Stack gap={0}>
        <Text fz={20} fw={700} ff="monospace" lh={1.1}>
          {count}
        </Text>
        <Text size="xs" c="dimmed">
          {label}
        </Text>
      </Stack>
    </Group>
  );
}

/** What the minutes are shaping up to contain: topics popping in as they're found, decisions and tasks ticking up. */
export function LiveMinutesPreview({ data }: { data: LiveProcessing | undefined }) {
  const { t } = useTranslation('meetings');
  const topics = data?.topics ?? [];
  const decisions = data?.decisions ?? 0;
  const tasks = data?.tasks ?? 0;
  const empty = topics.length === 0 && decisions === 0 && tasks === 0;

  return (
    <Paper withBorder p="md">
      <Stack gap="md">
        <Text fw={600} size="sm">
          {t('processingCard.minutesPreview.title')}
        </Text>
        {empty ? (
          <Text c="dimmed" size="sm" ta="center" py="xl">
            {t('processingCard.minutesPreview.empty')}
          </Text>
        ) : (
          <>
            {topics.length > 0 ? (
              <Group gap={6}>
                {topics.map((topic, index) => (
                  <Badge
                    key={topic}
                    variant="light"
                    color="teal"
                    className="topic-chip"
                    style={{ animationDelay: `${Math.min(index, STAGGERED_CHIPS) * 45}ms` }}
                  >
                    {topic}
                  </Badge>
                ))}
              </Group>
            ) : (
              <Text c="dimmed" size="xs">
                {t('processingCard.minutesPreview.empty')}
              </Text>
            )}
            <Group gap="xl">
              <CountStat
                icon={IconGavel}
                label={t('processingCard.minutesPreview.decisions')}
                value={decisions}
                color="grape"
              />
              <CountStat
                icon={IconListCheck}
                label={t('processingCard.minutesPreview.tasks')}
                value={tasks}
                color="orange"
              />
            </Group>
          </>
        )}
      </Stack>
    </Paper>
  );
}
