import { Badge, Box, Group, Highlight, Paper, Select, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import type { MantineColor } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useRef, useState } from 'react';

import { meetingsApi } from '../../api/endpoints';
import { useMinutes, useTranscript } from '../../api/queries';
import type { Utterance } from '../../api/types';
import { LanguageBadges } from '../../components/Badges';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { formatClock } from '../../lib/format';
import { languageLabel } from '../../lib/languages';
import { matchesQuery } from '../../lib/search';

const SPEAKER_COLORS: MantineColor[] = ['blue', 'grape', 'orange', 'teal', 'pink', 'lime', 'indigo', 'cyan', 'red'];

/** A stable color per speaker label ("SPEAKER 3" is always the same color). */
function speakerColor(speaker: string): MantineColor {
  const number = Number(/\d+/.exec(speaker)?.[0] ?? 0);
  return SPEAKER_COLORS[Math.max(0, number - 1) % SPEAKER_COLORS.length];
}

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

/** Who said what, with language tags, search, and playback when the recording is kept. */
export function TranscriptTab({ meetingId, active }: { meetingId: string; active: boolean }) {
  const transcript = useTranscript(meetingId, active);
  const participants = useMinutes(meetingId).data?.participants;
  const [query, setQuery] = useState('');
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [audioMissing, setAudioMissing] = useState(false);
  const [playing, setPlaying] = useState(-1);
  const audio = useRef<HTMLAudioElement>(null);

  if (transcript.isPending) return <LoadingState />;
  if (transcript.isError) return <ErrorState error={transcript.error} onRetry={() => void transcript.refetch()} />;

  const { utterances } = transcript.data;
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
          {audioMissing ? (
            <Text size="sm" c="dimmed">
              The recording is not kept on the server (privacy setting), so it cannot be played back.
            </Text>
          ) : (
            <audio
              ref={audio}
              controls
              preload="metadata"
              src={meetingsApi.audioUrl(meetingId)}
              onError={() => setAudioMissing(true)}
              onTimeUpdate={(event) => setPlaying(utteranceAt(utterances, event.currentTarget.currentTime))}
              style={{ width: '100%' }}
              aria-label="Meeting recording"
            />
          )}
          <Group gap="sm" align="flex-end">
            <TextInput
              label="Search"
              placeholder="Words in the transcript"
              leftSection={<IconSearch size={16} />}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              style={{ flex: 1 }}
              miw={200}
            />
            <Select
              label="Speaker"
              placeholder="All speakers"
              data={speakers.map((label) => ({ value: label, label: describe(label) }))}
              value={speaker}
              onChange={setSpeaker}
              clearable
              w={{ base: '100%', sm: 300 }}
            />
          </Group>
          <Text size="xs" c="dimmed">
            {shown.length} of {utterances.length} utterances · {languageShares(utterances)}
          </Text>
        </Stack>
      </Paper>

      <Paper withBorder>
        {shown.length === 0 && (
          <Text c="dimmed" ta="center" py="lg" size="sm">
            Nothing matches.
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
              <UnstyledButton
                onClick={() => seek(utterance.start)}
                disabled={audioMissing}
                aria-label={`Play from ${formatClock(utterance.start)}`}
              >
                <Text size="sm" ff="monospace" c={audioMissing ? 'dimmed' : 'teal.7'}>
                  {formatClock(utterance.start)}
                </Text>
              </UnstyledButton>
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
                      {utterance.accent} accent
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
