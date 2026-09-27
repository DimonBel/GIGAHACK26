import { Badge, Box, Group, Highlight, Paper, Select, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { meetingsApi } from '../../api/endpoints';
import { useMinutes, useTranscript } from '../../api/queries';
import type { Utterance } from '../../api/types';
import { LanguageBadges } from '../../components/Badges';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { formatClock } from '../../lib/format';
import { languageLabel } from '../../lib/languages';
import { speakerColor } from '../../lib/minutesDoc';
import { matchesQuery } from '../../lib/search';

/** "Romanian 81% · Russian 15% · English 4%": share of utterances in which each language is spoken. */
function languageShares(utterances: Utterance[]): string {
  const counts = new Map<string, number>();
  for (const utterance of utterances) {
    for (const code of utterance.languages) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => `${languageLabel(code)} ${Math.round((count / total) * 100)}%`)
    .join(' · ');
}

/** Index of the utterance being played at a position, or -1. */
function utteranceAt(utterances: Utterance[], seconds: number): number {
  return utterances.findLastIndex((utterance) => utterance.start <= seconds && seconds < utterance.end);
}

interface TranscriptTabProps {
  meetingId: string;
  active: boolean;
  /** The recording is kept on the server: it can be played from any line. */
  hasAudio: boolean;
}

/** Who said what, with language tags, search, and playback when the recording is kept. */
export function TranscriptTab({ meetingId, active, hasAudio }: TranscriptTabProps) {
  const { t } = useTranslation(['meetings', 'common']);
  const transcript = useTranscript(meetingId, active);
  const participants = useMinutes(meetingId).data?.participants;
  const [query, setQuery] = useState('');
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [audioFailed, setAudioFailed] = useState(false);
  const [playing, setPlaying] = useState(-1);
  const audio = useRef<HTMLAudioElement>(null);

  if (transcript.isPending) return <LoadingState />;
  if (transcript.isError) return <ErrorState error={transcript.error} onRetry={() => void transcript.refetch()} />;

  const { utterances } = transcript.data;
  const playable = hasAudio && !audioFailed;
  const speakers = [...new Set(utterances.map((utterance) => utterance.speaker))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  const describe = (label: string) => {
    const participant = participants?.[label];
    return [label, participant?.name, participant?.role].filter(Boolean).join(' · ');
  };
  const shown = utterances
    .map((utterance, index) => ({ utterance, index }))
    .filter(({ utterance }) => (!speaker || utterance.speaker === speaker) && matchesQuery(utterance.text, query));

  const seek = (seconds: number) => {
    const player = audio.current;
    if (!player) return;
    player.currentTime = seconds;
    void player.play();
  };

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Stack gap="sm">
          {playable && (
            <audio
              ref={audio}
              controls
              preload="metadata"
              src={meetingsApi.audioUrl(meetingId)}
              onError={() => setAudioFailed(true)}
              onTimeUpdate={(event) => setPlaying(utteranceAt(utterances, event.currentTarget.currentTime))}
              style={{ width: '100%' }}
              aria-label={t('transcriptTab.recordingAria')}
            />
          )}
          <Group gap="sm" align="flex-end">
            <TextInput
              label={t('common:action.search')}
              placeholder={t('transcriptTab.searchPlaceholder')}
              leftSection={<IconSearch size={16} />}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              style={{ flex: 1 }}
              miw={200}
            />
            <Select
              label={t('transcriptTab.speaker')}
              placeholder={t('transcriptTab.allSpeakers')}
              data={speakers.map((label) => ({ value: label, label: describe(label) }))}
              value={speaker}
              onChange={setSpeaker}
              clearable
              w={{ base: '100%', sm: 300 }}
            />
          </Group>
          <Text size="xs" c="dimmed">
            {shown.length === utterances.length
              ? t('transcriptTab.lines', { count: utterances.length })
              : t('transcriptTab.summary', { shown: shown.length, count: utterances.length })}{' '}
            · {languageShares(utterances)}
          </Text>
        </Stack>
      </Paper>

      <Paper withBorder>
        {shown.length === 0 && (
          <Text c="dimmed" ta="center" py="lg" size="sm">
            {t('transcriptTab.noMatches')}
          </Text>
        )}
        {shown.map(({ utterance, index }) => {
          const participant = participants?.[utterance.speaker];
          const role = participant?.role || utterance.role;
          return (
            <Group
              key={index}
              gap="md"
              wrap="nowrap"
              align="flex-start"
              px="md"
              py="sm"
              bg={index === playing ? 'teal.0' : undefined}
              style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}
            >
              {playable ? (
                <UnstyledButton
                  onClick={() => seek(utterance.start)}
                  aria-label={t('transcriptTab.playFrom', { time: formatClock(utterance.start) })}
                >
                  <Text size="sm" ff="monospace" c="teal.7">
                    {formatClock(utterance.start)}
                  </Text>
                </UnstyledButton>
              ) : (
                <Text size="sm" ff="monospace" c="dimmed">
                  {formatClock(utterance.start)}
                </Text>
              )}
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Group gap={8} mb={4}>
                  <Badge variant="light" color={speakerColor(utterance.speaker)}>
                    {participant?.name ? `${utterance.speaker} · ${participant.name}` : utterance.speaker}
                  </Badge>
                  {role && (
                    <Text size="xs" c="dimmed">
                      {role}
                    </Text>
                  )}
                  <LanguageBadges languages={utterance.languages} />
                  {utterance.accent && (
                    <Text size="xs" c="dimmed">
                      {t('transcriptTab.accent', { accent: utterance.accent })}
                    </Text>
                  )}
                </Group>
                <Highlight highlight={query} size="sm">
                  {utterance.text}
                </Highlight>
              </Box>
            </Group>
          );
        })}
      </Paper>
    </Stack>
  );
}
