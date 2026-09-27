import { Alert, Badge, Box, Button, Group, Progress, Stack, Text } from '@mantine/core';
import { IconMicrophone, IconPlayerPause, IconPlayerPlay, IconPlayerStop } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAudioLevel } from '../hooks/useAudioLevel';
import { formatClock } from '../lib/format';

type RecorderStatus = 'idle' | 'starting' | 'recording' | 'paused';

/** Formats the browser may record in, best first (Safari only offers mp4). */
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const FALLBACK_TYPE = 'audio/webm';
const TICK_MS = 250;
const TIMESLICE_MS = 1000;

interface Session {
  recorder: MediaRecorder;
  chunks: Blob[];
  /** Recorded time before the current stretch, which started at resumedAt (performance.now()). */
  elapsedMs: number;
  resumedAt: number;
}

const pad = (value: number) => String(value).padStart(2, '0');

function supportedMimeType(): string | undefined {
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

/** "recording-2026-09-26-1349.webm" in local time. */
function recordingName(type: string, date: Date): string {
  const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `recording-${day}-${pad(date.getHours())}${pad(date.getMinutes())}.${extension}`;
}

type MicrophoneErrorKey =
  'recorder.error.denied' | 'recorder.error.notFound' | 'recorder.error.notReadable' | 'recorder.error.generic';

function microphoneErrorKey(error: unknown): MicrophoneErrorKey {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError') return 'recorder.error.denied';
  if (name === 'NotFoundError') return 'recorder.error.notFound';
  if (name === 'NotReadableError') return 'recorder.error.notReadable';
  return 'recorder.error.generic';
}

function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined' && 'mediaDevices' in navigator;
}

interface RecorderProps {
  onRecorded: (file: File) => void;
  onRecordingChange?: (recording: boolean) => void;
}

/** Records the microphone with MediaRecorder: Rec, pause / resume, stop; hands over the file at stop. */
export function Recorder({ onRecorded, onRecordingChange }: RecorderProps) {
  const { t } = useTranslation('meetings');
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<Session | null>(null);
  const level = useAudioLevel(status === 'recording' ? stream : null);

  useEffect(() => {
    if (!stream) return;
    return () => stream.getTracks().forEach((track) => track.stop());
  }, [stream]);

  useEffect(() => {
    if (status !== 'recording') return;
    const timer = window.setInterval(() => {
      const current = session.current;
      if (current) setElapsedMs(current.elapsedMs + performance.now() - current.resumedAt);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [status]);

  async function start() {
    setError(null);
    setStatus('starting');
    let media: MediaStream | undefined;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = supportedMimeType();
      const recorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      const current: Session = { recorder, chunks: [], elapsedMs: 0, resumedAt: performance.now() };
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) current.chunks.push(event.data);
      };
      recorder.onstop = () => {
        const type = (recorder.mimeType || mimeType || FALLBACK_TYPE).split(';')[0];
        const blob = new Blob(current.chunks, { type });
        session.current = null;
        setStream(null);
        setStatus('idle');
        setElapsedMs(0);
        onRecordingChange?.(false);
        if (blob.size > 0) onRecorded(new File([blob], recordingName(type, new Date()), { type }));
      };
      recorder.start(TIMESLICE_MS);
      session.current = current;
      setStream(media);
      setElapsedMs(0);
      setStatus('recording');
      onRecordingChange?.(true);
    } catch (startError) {
      media?.getTracks().forEach((track) => track.stop());
      setStatus('idle');
      setError(t(microphoneErrorKey(startError)));
    }
  }

  function pause() {
    const current = session.current;
    if (!current) return;
    current.recorder.pause();
    current.elapsedMs += performance.now() - current.resumedAt;
    setElapsedMs(current.elapsedMs);
    setStatus('paused');
  }

  function resume() {
    const current = session.current;
    if (!current) return;
    current.resumedAt = performance.now();
    current.recorder.resume();
    setStatus('recording');
  }

  if (!canRecord()) {
    return (
      <Alert color="yellow" title={t('recorder.notAvailable.title')}>
        {t('recorder.notAvailable.body')}
      </Alert>
    );
  }

  const active = status === 'recording' || status === 'paused';

  return (
    <Stack align="center" gap="md" py="lg">
      {active ? (
        <>
          <Group gap="sm" aria-live="polite">
            <Box w={12} h={12} bg={status === 'recording' ? 'red.6' : 'gray.5'} style={{ borderRadius: '50%' }} />
            <Text fw={700} ff="monospace" fz={32} lh={1}>
              {formatClock(elapsedMs / 1000)}
            </Text>
            {status === 'paused' && <Badge color="gray">{t('recorder.paused')}</Badge>}
          </Group>
          <Progress
            value={level * 100}
            w="100%"
            maw={320}
            size="sm"
            color={level > 0.9 ? 'red' : 'teal'}
            transitionDuration={0}
            aria-label={t('recorder.levelAria')}
          />
          <Group>
            {status === 'recording' ? (
              <Button variant="default" leftSection={<IconPlayerPause size={18} />} onClick={pause}>
                {t('recorder.pause')}
              </Button>
            ) : (
              <Button variant="default" leftSection={<IconPlayerPlay size={18} />} onClick={resume}>
                {t('recorder.resume')}
              </Button>
            )}
            <Button
              color="red"
              leftSection={<IconPlayerStop size={18} />}
              onClick={() => session.current?.recorder.stop()}
            >
              {t('recorder.stop')}
            </Button>
          </Group>
        </>
      ) : (
        <>
          <Button
            size="xl"
            radius="xl"
            color="red"
            leftSection={<IconMicrophone size={26} />}
            loading={status === 'starting'}
            onClick={() => void start()}
          >
            {t('recorder.start')}
          </Button>
          <Text size="sm" c="dimmed" ta="center">
            {t('recorder.hint')}
          </Text>
        </>
      )}
      {error && (
        <Alert color="red" w="100%">
          {error}
        </Alert>
      )}
    </Stack>
  );
}
