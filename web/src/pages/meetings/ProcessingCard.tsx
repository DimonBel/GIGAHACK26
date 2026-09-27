import { Group, Paper, Progress, Stack, Stepper, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';

import type { Meeting } from '../../api/types';
import { useNow } from '../../hooks/useNow';
import { formatClock } from '../../lib/format';
import { STAGE_ORDER, stageDescription, stageLabel } from '../../lib/meeting';

const TICK_MS = 1000;
const NARROW = '(max-width: 48em)';
const ROOMY = '(min-width: 90em)';

/** Live progress of a queued or processing meeting: stage, chunks done, time since upload. */
export function ProcessingCard({ meeting }: { meeting: Meeting }) {
  const { t } = useTranslation(['meetings', 'common']);
  const now = useNow(TICK_MS);
  const narrow = useMediaQuery(NARROW);
  const roomy = useMediaQuery(ROOMY);
  const { progress } = meeting;
  const stage = meeting.status === 'queued' ? 'queued' : (progress?.stage ?? 'converting');
  const active = Math.max(0, STAGE_ORDER.indexOf(stage));
  const elapsed = (now - Date.parse(meeting.created_at)) / 1000;
  const chunks = progress?.stage === 'transcribing' && progress.total > 0 ? progress : null;

  return (
    <Paper withBorder p="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={4}>
            {meeting.status === 'queued' ? t('processingCard.waiting') : t('common:status.processing')}
          </Title>
          <Text size="sm" c="dimmed" ff="monospace" aria-label={t('processingCard.timeSinceUpload')}>
            {Number.isFinite(elapsed) ? formatClock(elapsed) : ''}
          </Text>
        </Group>
        <Stepper active={active} orientation={narrow ? 'vertical' : 'horizontal'} size="sm">
          {STAGE_ORDER.map((step) => (
            <Stepper.Step
              key={step}
              label={stageLabel(step)}
              description={narrow || roomy ? stageDescription(step) : undefined}
              loading={step === stage && stage !== 'queued'}
            />
          ))}
        </Stepper>
        {chunks && (
          <Progress.Root size="lg" aria-label={t('processingCard.transcriptionProgress')}>
            <Progress.Section value={(chunks.done / chunks.total) * 100}>
              <Progress.Label>
                {chunks.done} / {chunks.total}
              </Progress.Label>
            </Progress.Section>
          </Progress.Root>
        )}
        {progress?.message && <Text size="sm">{progress.message}</Text>}
        <Text size="xs" c="dimmed">
          {t('processingCard.footer')}
        </Text>
      </Stack>
    </Paper>
  );
}
