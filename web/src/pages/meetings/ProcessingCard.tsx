import { Box, Grid, Group, Paper, Progress, Stack, Stepper, Text, Title, VisuallyHidden } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { useLiveProcessing } from '../../api/queries';
import type { Meeting } from '../../api/types';
import { useNow } from '../../hooks/useNow';
import { formatClock } from '../../lib/format';
import { STAGE_ORDER, stageDescription, stageLabel } from '../../lib/meeting';
import { LiveMinutesPreview } from './LiveMinutesPreview';
import { LiveTranscriptPanel } from './LiveTranscriptPanel';

const TICK_MS = 1000;
const NARROW = '(max-width: 48em)';
const ROOMY = '(min-width: 100em)'; // room for the steps' descriptions on one row

/**
 * Live progress of a queued or processing meeting: an animated stage tracker, a live transcript feed, a preview
 * of what the minutes are shaping up to contain, and (briefly, via `done`) a success beat once it finishes.
 */
export function ProcessingCard({ meeting, done = false }: { meeting: Meeting; done?: boolean }) {
  const { t } = useTranslation(['meetings', 'common']);
  const now = useNow(TICK_MS, !done);
  const narrow = useMediaQuery(NARROW);
  const roomy = useMediaQuery(ROOMY);
  const live = useLiveProcessing(meeting.id, !done);
  const queued = meeting.status === 'queued';
  const { progress } = meeting;
  const stage = queued ? 'queued' : (progress?.stage ?? 'converting');
  const active = done ? STAGE_ORDER.length : Math.max(0, STAGE_ORDER.indexOf(stage));
  const elapsed = (now - Date.parse(meeting.created_at)) / 1000;
  const chunks = progress?.stage === 'transcribing' && progress.total > 0 ? progress : null;
  // What is happening now, in the app's language (the server's progress message is English).
  const activity =
    stage === 'converting' || stage === 'transcribing' || stage === 'speakers' || stage === 'minutes'
      ? t(`processingCard.activity.${stage}`)
      : stageDescription(stage);
  const title = done
    ? t('processingCard.done.title')
    : queued
      ? t('processingCard.waiting')
      : t('common:status.processing');

  return (
    <Paper withBorder p="lg" className="processing-card">
      <Stack gap="lg">
        {/* Transcript lines change too often to announce; a stage change is the meaningful, infrequent update. */}
        <VisuallyHidden aria-live="polite" aria-atomic="true">
          {title}
          {!done && `: ${stageLabel(stage)}`}
        </VisuallyHidden>

        <Group justify="space-between" wrap="nowrap">
          <Group gap={8} wrap="nowrap">
            {done ? (
              <IconCircleCheckFilled size={22} className="success-check" color="var(--mantine-color-teal-6)" />
            ) : (
              !queued && <Box className="live-dot" aria-hidden="true" />
            )}
            <Title order={4}>{title}</Title>
          </Group>
          {!done && (
            <Text size="sm" c="dimmed" ff="monospace" aria-label={t('processingCard.timeSinceUpload')}>
              {Number.isFinite(elapsed) ? formatClock(elapsed) : ''}
            </Text>
          )}
        </Group>

        <Stepper active={active} orientation={narrow ? 'vertical' : 'horizontal'} size="sm">
          {STAGE_ORDER.map((step) => (
            <Stepper.Step
              key={step}
              label={stageLabel(step)}
              description={narrow || roomy ? stageDescription(step) : undefined}
              loading={!done && step === stage && stage !== 'queued'}
            />
          ))}
        </Stepper>

        {done ? (
          <Text size="sm" c="dimmed" ta="center" className="success-fade">
            {t('processingCard.done.subtitle')}
          </Text>
        ) : queued ? (
          <Text size="sm" c="dimmed">
            {t('processingCard.queuedHint')}
          </Text>
        ) : (
          <>
            <Text size="sm" fw={500}>
              {activity}
            </Text>
            {chunks && (
              <Progress.Root size="lg" transitionDuration={500} aria-label={t('processingCard.transcriptionProgress')}>
                <Progress.Section value={(chunks.done / chunks.total) * 100} color="teal">
                  <Progress.Label>
                    {chunks.done} / {chunks.total}
                  </Progress.Label>
                </Progress.Section>
              </Progress.Root>
            )}
            <Grid gap="md">
              <Grid.Col span={{ base: 12, md: 7 }}>
                <LiveTranscriptPanel data={live.data} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 5 }}>
                <LiveMinutesPreview data={live.data} />
              </Grid.Col>
            </Grid>
          </>
        )}

        {!done && (
          <Text size="xs" c="dimmed">
            {t('processingCard.footer')}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
