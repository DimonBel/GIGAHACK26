import { Box, Button, ColorSwatch, Group, Loader, Stack, Text } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useRef, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { useTranscript } from '../../api/queries';
import type { Utterance } from '../../api/types';
import { formatClock } from '../../lib/format';
import { lineAt, speakerColor, speakerName, topicRange } from '../../lib/minutesDoc';
import type { ParticipantRow } from '../../lib/minutesForm';
import { LanguageBadges } from '../Badges';
import { useMinutesDocument } from './context';

const RANGE_SLACK_S = 1; // topic times are whole seconds

function Line({
  line,
  participants,
  active,
  target,
}: {
  line: Utterance;
  participants: ParticipantRow[];
  active: boolean;
  target?: Ref<HTMLDivElement>;
}) {
  return (
    <Group
      ref={target}
      gap="sm"
      wrap="nowrap"
      align="flex-start"
      px="sm"
      py={6}
      bg={active ? 'teal.0' : undefined}
      style={{ borderRadius: 6, boxShadow: active ? 'inset 0 0 0 1px var(--mantine-color-teal-3)' : undefined }}
    >
      <span className="time-link time-link-plain">{formatClock(line.start)}</span>
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Group gap={6} wrap="nowrap">
          <ColorSwatch size={8} color={`var(--mantine-color-${speakerColor(line.speaker)}-6)`} withShadow={false} />
          <Text size="xs" fw={600} truncate>
            {speakerName(participants, line.speaker)}
          </Text>
          <LanguageBadges languages={line.languages} />
        </Group>
        <Text size="sm">{line.text}</Text>
      </Box>
    </Group>
  );
}

/** The part of the transcript where a topic was discussed; opens at a time clicked in the minutes (a time said while
 *  another topic was discussed is shown below it). The transcript is fetched (and audited) only once it is opened. */
export function TopicTranscript({ index }: { index: number }) {
  const { t } = useTranslation('minutes');
  const { values, transcriptOf, focus, clearFocus } = useMinutesDocument();
  const topic = values.topics[index];
  const focused = focus?.topic === topic.key ? focus : null;
  const [open, setOpen] = useState(false);
  const shown = open || focused !== null;
  const transcript = useTranscript(transcriptOf ?? '', shown && transcriptOf !== null);
  const target = useRef<HTMLDivElement>(null);
  const scrolledTo = useRef<number | null>(null);

  const range = topicRange(values.topics, index);
  const utterances = transcript.data?.utterances ?? [];
  const lines = range ? utterances.filter((line) => line.end > range.start && line.start < range.end) : [];
  const inside =
    focused !== null && range !== null && focused.seconds >= range.start - RANGE_SLACK_S && focused.seconds < range.end;
  const current = focused && inside ? lineAt(lines, focused.seconds) : -1;
  const elsewhere = focused && !inside ? lineAt(utterances, focused.seconds) : -1;
  const focusAt = focused?.at;
  const loaded = transcript.data !== undefined;

  // Once per click: editing the topic (its lines change) must not scroll the page back here.
  useEffect(() => {
    if (focusAt === undefined || scrolledTo.current === focusAt || !target.current) return;
    scrolledTo.current = focusAt;
    target.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusAt, loaded]);

  if (!transcriptOf || !range) return null;

  const toggle = () => {
    if (shown) clearFocus();
    setOpen(!shown);
  };

  return (
    <Stack gap="sm" pt="md" style={{ borderTop: '1px solid var(--mantine-color-gray-2)' }}>
      <Button
        variant="subtle"
        size="compact-sm"
        w="fit-content"
        leftSection={shown ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
        onClick={toggle}
        aria-expanded={shown}
      >
        {shown ? t('transcript.hide') : t('transcript.show')}
        {loaded ? ` · ${t('transcript.lines', { count: lines.length })}` : ''}
      </Button>
      {shown && transcript.isPending && <Loader size="sm" />}
      {shown && transcript.isError && (
        <Text size="sm" c="red">
          {t('transcript.loadError')}
        </Text>
      )}
      {shown && loaded && (
        <Stack gap={2} p={6} bg="gray.0" mah={480} style={{ overflowY: 'auto', borderRadius: 8 }}>
          {lines.length === 0 && (
            <Text size="sm" c="dimmed" p="sm">
              {t('transcript.noLines')}
            </Text>
          )}
          {lines.map((line, lineIndex) => (
            <Line
              key={`${line.start}-${lineIndex}`}
              line={line}
              participants={values.participants}
              active={lineIndex === current}
              target={lineIndex === current ? target : undefined}
            />
          ))}
          {elsewhere >= 0 && (
            <>
              <Text size="xs" c="dimmed" px="sm" pt="sm">
                {t('transcript.saidElsewhere', { time: formatClock(utterances[elsewhere].start) })}
              </Text>
              <Line line={utterances[elsewhere]} participants={values.participants} active target={target} />
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
}
