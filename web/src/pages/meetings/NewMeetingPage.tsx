import {
  Button,
  CloseButton,
  Grid,
  Group,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { Dropzone, type FileRejection } from '@mantine/dropzone';
import { IconFileMusic, IconUpload, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useCreateMeeting } from '../../api/queries';
import type { MeetingType } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { Recorder } from '../../components/Recorder';
import { useLeaveGuard } from '../../hooks/useLeaveGuard';
import { formatBytes } from '../../lib/format';
import { MEETING_TYPES } from '../../lib/meeting';
import { notifyError, notifySuccess } from '../../lib/notify';

type Source = 'upload' | 'record';

/** Any audio or video file. Browsers leave the type of some of these extensions empty, so they are listed too
 *  (react-dropzone would read extensions under a wildcard type as a restriction). */
const ACCEPTED_FILES = {
  'audio/*': [],
  'video/*': [],
  'audio/mp4': ['.m4a'],
  'audio/ogg': ['.ogg', '.oga', '.opus'],
  'audio/amr': ['.amr'],
  'audio/x-ms-wma': ['.wma'],
  'video/x-matroska': ['.mkv'],
};

interface Selection {
  file: File;
  url: string;
}

export function NewMeetingPage() {
  const navigate = useNavigate();
  const create = useCreateMeeting();
  const [source, setSource] = useState<Source>('upload');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [recording, setRecording] = useState(false);
  const [meetingType, setMeetingType] = useState<MeetingType>('medical');
  const [title, setTitle] = useState('');
  const [uploaded, setUploaded] = useState(0);
  const upload = useRef<AbortController | null>(null);
  const guard = useLeaveGuard(
    recording || selection !== null,
    'The recording has not been uploaded yet and will be lost.',
  );

  useEffect(() => {
    if (!selection) return;
    return () => URL.revokeObjectURL(selection.url);
  }, [selection]);

  const choose = (file: File) => setSelection({ file, url: URL.createObjectURL(file) });

  const reject = (rejections: FileRejection[]) =>
    notifyError(new Error(`${rejections[0]?.file.name ?? 'This file'} is not an audio or video file.`));

  const submit = () => {
    if (!selection) return;
    const controller = new AbortController();
    upload.current = controller;
    setUploaded(0);
    create.mutate(
      {
        input: { file: selection.file, meetingType, title },
        options: { onProgress: setUploaded, signal: controller.signal },
      },
      {
        onSuccess: (meeting) => {
          guard.release();
          notifySuccess('Uploaded. The transcription has started.');
          void navigate(`/meetings/${meeting.id}`);
        },
      },
    );
  };

  const uploading = create.isPending;

  return (
    <>
      <PageHeader
        title="New meeting"
        description="Upload a recording or record the meeting here. Everything is processed on this server."
        back={{ to: '/meetings', label: 'Meetings' }}
      />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Paper withBorder p="lg">
            <Stack>
              <Title order={4}>1. Recording</Title>
              <SegmentedControl
                value={source}
                onChange={(value) => setSource(value)}
                disabled={recording || uploading}
                data={[
                  { value: 'upload', label: 'Upload a file' },
                  { value: 'record', label: 'Record now' },
                ]}
                aria-label="Recording source"
              />
              {source === 'upload' ? (
                <Dropzone
                  onDrop={(files) => files[0] && choose(files[0])}
                  onReject={reject}
                  accept={ACCEPTED_FILES}
                  multiple={false}
                  disabled={uploading}
                  aria-label="Recording file"
                >
                  <Stack
                    align="center"
                    justify="center"
                    gap={6}
                    mih={170}
                    ta="center"
                    style={{ pointerEvents: 'none' }}
                  >
                    <Dropzone.Accept>
                      <IconUpload size={44} color="var(--mantine-color-teal-6)" />
                    </Dropzone.Accept>
                    <Dropzone.Reject>
                      <IconX size={44} color="var(--mantine-color-red-6)" />
                    </Dropzone.Reject>
                    <Dropzone.Idle>
                      <IconFileMusic size={44} color="var(--mantine-color-dimmed)" />
                    </Dropzone.Idle>
                    <Text size="lg">Drop the recording here or click to choose it</Text>
                    <Text size="sm" c="dimmed">
                      Audio or video: m4a, mp3, wav, ogg, webm, mp4, mov…
                    </Text>
                  </Stack>
                </Dropzone>
              ) : (
                <Recorder onRecorded={choose} onRecordingChange={setRecording} />
              )}
              {selection && (
                <Paper withBorder p="sm" bg="gray.0">
                  <Group justify="space-between" wrap="nowrap" mb="xs">
                    <Group gap="xs" wrap="nowrap" miw={0}>
                      <IconFileMusic size={20} />
                      <Stack gap={0} miw={0}>
                        <Text size="sm" fw={600} truncate>
                          {selection.file.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatBytes(selection.file.size)}
                        </Text>
                      </Stack>
                    </Group>
                    <CloseButton
                      aria-label="Remove the recording"
                      disabled={uploading}
                      onClick={() => setSelection(null)}
                    />
                  </Group>
                  <audio controls src={selection.url} preload="metadata" style={{ width: '100%' }} />
                </Paper>
              )}
            </Stack>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Paper withBorder p="lg">
            <Stack>
              <Title order={4}>2. Meeting</Title>
              <Select
                label="Meeting type"
                description="Chooses how the minutes are written and who receives them."
                data={MEETING_TYPES}
                value={meetingType}
                onChange={(value) => value && setMeetingType(value)}
                allowDeselect={false}
                disabled={uploading}
                required
              />
              <TextInput
                label="Title"
                description="Optional."
                placeholder="e.g. Medical board 26.09"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                disabled={uploading}
                maxLength={200}
              />
              {uploading ? (
                <Stack gap="xs">
                  <Text size="sm">
                    {uploaded < 1 ? `Uploading… ${Math.round(uploaded * 100)} %` : 'Checking the file…'}
                  </Text>
                  <Progress value={uploaded * 100} animated={uploaded >= 1} striped={uploaded >= 1} />
                  <Button variant="default" onClick={() => upload.current?.abort()}>
                    Cancel upload
                  </Button>
                </Stack>
              ) : (
                <Button
                  size="md"
                  leftSection={<IconUpload size={18} />}
                  disabled={!selection || recording}
                  onClick={submit}
                >
                  Upload and process
                </Button>
              )}
              <Text size="xs" c="dimmed">
                The recording is transcribed and summarised on this server. A one-hour meeting takes a few minutes.
              </Text>
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>
      {guard.modal}
    </>
  );
}
