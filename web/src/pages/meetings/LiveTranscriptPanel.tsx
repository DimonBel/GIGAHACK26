import { Badge, Box, Button, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { LiveLine, LiveProcessing } from '../../api/types';
import { LanguageBadges } from '../../components/Badges';
import { formatClock } from '../../lib/format';
import { speakerColor, speakerLabel } from '../../lib/minutesDoc';

/** Only the newest lines are kept on screen: plenty to follow along, cheap to re-render every poll. */
const VISIBLE_LINES = 15;
/** Close enough to the bottom edge that catching up counts as "still following". */
const NEAR_BOTTOM_PX = 48;

function LiveLineRow({ line, newest }: { line: LiveLine; newest: boolean }) {
  const { t } = useTranslation('meetings');
  const known = line.speaker !== '';
  return (
    <Group gap={8} wrap="nowrap" align="flex-start" className="live-line">
      <Text size="xs" ff="monospace" c="dimmed" mt={2} style={{ flexShrink: 0 }}>
        {formatClock(line.start)}
      </Text>
      <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
        <Group gap={6} wrap="nowrap">
          {known ? (
            <Badge size="xs" variant="light" color={speakerColor(line.speaker)}>
              {speakerLabel(line.speaker)}
            </Badge>
          ) : (
            <Tooltip label={t('processingCard.live.identifying')} withinPortal>
              <Badge
                size="xs"
                variant="outline"
                color="gray"
                aria-label={t('processingCard.live.identifying')}
                className="live-identifying-badge"
              >
                …
              </Badge>
            </Tooltip>
          )}
          <LanguageBadges languages={line.languages} />
        </Group>
        <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
          {line.text}
          {newest && <span className="live-caret" aria-hidden="true" />}
        </Text>
      </Stack>
    </Group>
  );
}

/** The transcript as it is heard: newest lines slide in, auto-following unless the moderator scrolled up. */
export function LiveTranscriptPanel({ data }: { data: LiveProcessing | undefined }) {
  const { t } = useTranslation('meetings');
  const reducedMotion = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [autoFollow, setAutoFollow] = useState(true);

  const lines = data?.lines ?? [];
  const speakers = data?.speakers ?? false;
  const shown = lines.slice(-VISIBLE_LINES);
  const last = shown.at(-1);
  // Re-follow when a new line arrives, and also while the newest line's own text keeps growing.
  const newestSignature = last ? `${last.start}:${last.text.length}` : '';

  // The box scrolls, never the page: the moderator may be reading the stages above it.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (autoFollow && viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }, [newestSignature, autoFollow, reducedMotion]);

  const onScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setAutoFollow(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < NEAR_BOTTOM_PX);
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap={8} wrap="nowrap">
            <Box className="live-dot" aria-hidden="true" />
            <Text fw={600} size="sm">
              {t('processingCard.live.title')}
            </Text>
            <Badge size="xs" color="red" variant="filled" radius="sm">
              {t('processingCard.live.badge')}
            </Badge>
          </Group>
          {data && data.total > 0 && (
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {t('processingCard.live.count', { count: data.total })}
            </Text>
          )}
        </Group>
        <div ref={viewportRef} onScroll={onScroll} className="live-transcript-viewport">
          {shown.length === 0 ? (
            <Text c="dimmed" size="sm" ta="center" py="xl">
              {t('processingCard.live.empty')}
            </Text>
          ) : (
            <Stack gap={12}>
              {shown.map((line, index) => (
                <LiveLineRow key={`${speakers}:${line.start}`} line={line} newest={index === shown.length - 1} />
              ))}
            </Stack>
          )}
        </div>
        {!autoFollow && shown.length > 0 && (
          <Button size="xs" variant="light" onClick={() => setAutoFollow(true)}>
            {t('processingCard.live.jumpToLatest')}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
