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
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { useCreateMeeting } from '../../api/queries';
import type { MeetingType, MinutesLanguage } from '../../api/types';
import { PageHeader } from '../../components/PageHeader';
import { Recorder } from '../../components/Recorder';
import { useLeaveGuard } from '../../hooks/useLeaveGuard';
import { formatBytes } from '../../lib/format';
import { MINUTES_LANGUAGES } from '../../lib/languages';
import { meetingTypeOptions } from '../../lib/meeting';
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
  const { t } = useTranslation(['meetings', 'common']);
  const navigate = useNavigate();
  const create = useCreateMeeting();
  const [source, setSource] = useState<Source>('upload');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [recording, setRecording] = useState(false);
  const [meetingType, setMeetingType] = useState<MeetingType>('medical');
  const [minutesLanguage, setMinutesLanguage] = useState<MinutesLanguage>('ro');
  const [title, setTitle] = useState('');
  const [uploaded, setUploaded] = useState(0);
  const upload = useRef<AbortController | null>(null);
  const guard = useLeaveGuard(recording || selection !== null, t('newMeetingPage.leaveGuard'));

  useEffect(() => {
    if (!selection) return;
    return () => URL.revokeObjectURL(selection.url);
  }, [selection]);

  const choose = (file: File) => setSelection({ file, url: URL.createObjectURL(file) });

  const reject = (rejections: FileRejection[]) =>
    notifyError(
      new Error(t('newMeetingPage.invalidFile', { name: rejections[0]?.file.name ?? t('newMeetingPage.unnamedFile') })),
    );

  const submit = () => {
    if (!selection) return;
    const controller = new AbortController();
    upload.current = controller;
    setUploaded(0);
    create.mutate(
      {
        input: { file: selection.file, meetingType, minutesLanguage, title },
        options: { onProgress: setUploaded, signal: controller.signal },
      },
      {
        onSuccess: (meeting) => {
          guard.release();
          notifySuccess(t('newMeetingPage.uploaded'));
          void navigate(`/meetings/${meeting.id}`);
        },
      },
    );
  };

  const uploading = create.isPending;

  return (
    <>
      <PageHeader
        title={t('common:nav.newMeeting')}
        description={t('newMeetingPage.description')}
        back={{ to: '/meetings', label: t('common:nav.meetings') }}
      />
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Paper withBorder p="lg">
            <Stack>
              <Title order={4}>{t('newMeetingPage.recordingStep')}</Title>
              <SegmentedControl
                value={source}
                onChange={(value) => setSource(value)}
                disabled={recording || uploading}
                data={[
                  { value: 'upload', label: t('newMeetingPage.source.upload') },
                  { value: 'record', label: t('newMeetingPage.source.record') },
                ]}
                aria-label={t('newMeetingPage.source.aria')}
              />
              {source === 'upload' ? (
                <Dropzone
                  onDrop={(files) => files[0] && choose(files[0])}
                  onReject={reject}
                  accept={ACCEPTED_FILES}
                  multiple={false}
                  disabled={uploading}
                  aria-label={t('newMeetingPage.dropzone.aria')}
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
                    <Text size="lg">{t('newMeetingPage.dropzone.title')}</Text>
                    <Text size="sm" c="dimmed">
                      {t('newMeetingPage.dropzone.hint')}
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
                      aria-label={t('newMeetingPage.removeRecording')}
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
              <Title order={4}>{t('newMeetingPage.meetingStep')}</Title>
              <Select
                label={t('newMeetingPage.meetingType.label')}
                description={t('newMeetingPage.meetingType.description')}
                data={meetingTypeOptions()}
                value={meetingType}
                onChange={(value) => value && setMeetingType(value)}
                allowDeselect={false}
                disabled={uploading}
                required
              />
              <Stack gap={4}>
                <Text size="sm" fw={500} id="minutes-language-label">
                  {t('newMeetingPage.minutesLanguage.label')}
                </Text>
                <Text size="xs" c="dimmed">
                  {t('newMeetingPage.minutesLanguage.description')}
                </Text>
                <SegmentedControl
                  value={minutesLanguage}
                  onChange={(value) => setMinutesLanguage(value)}
                  data={MINUTES_LANGUAGES}
                  disabled={uploading}
                  color="teal"
                  fullWidth
                  aria-labelledby="minutes-language-label"
                />
              </Stack>
              <TextInput
                label={t('newMeetingPage.titleField.label')}
                description={t('newMeetingPage.titleField.description')}
                placeholder={t('newMeetingPage.titleField.placeholder')}
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                disabled={uploading}
                maxLength={200}
              />
              {uploading ? (
                <Stack gap="xs">
                  <Text size="sm">
                    {uploaded < 1
                      ? t('newMeetingPage.uploading', { percent: Math.round(uploaded * 100) })
                      : t('newMeetingPage.checkingFile')}
                  </Text>
                  <Progress value={uploaded * 100} animated={uploaded >= 1} striped={uploaded >= 1} />
                  <Button variant="default" onClick={() => upload.current?.abort()}>
                    {t('newMeetingPage.cancelUpload')}
                  </Button>
                </Stack>
              ) : (
                <Button
                  size="md"
                  leftSection={<IconUpload size={18} />}
                  disabled={!selection || recording}
                  onClick={submit}
                >
                  {t('newMeetingPage.submit')}
                </Button>
              )}
              <Text size="xs" c="dimmed">
                {t('newMeetingPage.footer')}
              </Text>
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>
      {guard.modal}
    </>
  );
}
