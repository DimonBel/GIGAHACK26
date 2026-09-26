import { ActionIcon, Alert, Group, Menu, Stack, Tabs, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconAlertTriangle,
  IconDotsVertical,
  IconFileText,
  IconHistory,
  IconMessages,
  IconSend,
  IconTrash,
} from '@tabler/icons-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { useDeleteMeeting, useMeeting } from '../../api/queries';
import type { Meeting } from '../../api/types';
import { useUser } from '../../auth/context';
import { MeetingStatusBadge, MeetingTypeBadge } from '../../components/Badges';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { ReceivedMinutes } from '../../components/ReceivedMinutes';
import { formatDateTime, formatDuration } from '../../lib/format';
import { languageLabel } from '../../lib/languages';
import { hasMinutes, isProcessing } from '../../lib/meeting';
import { notifySuccess } from '../../lib/notify';
import { MinutesTab } from './MinutesTab';
import { ProcessingCard } from './ProcessingCard';
import { SendTab } from './SendTab';
import { TranscriptTab } from './TranscriptTab';

type TabName = 'minutes' | 'transcript' | 'send';

function MeetingFacts({ meeting }: { meeting: Meeting }) {
  const facts = [
    `By ${meeting.created_by.full_name}`,
    formatDateTime(meeting.created_at),
    meeting.duration_s !== null && `Length ${formatDuration(meeting.duration_s)}`,
    meeting.language && `Language ${languageLabel(meeting.language)}`,
    meeting.timings?.total_s && `Processed in ${formatDuration(meeting.timings.total_s)}`,
  ].filter(Boolean);
  return (
    <Stack gap={6}>
      <Group gap="xs">
        <MeetingStatusBadge status={meeting.status} />
        <MeetingTypeBadge type={meeting.meeting_type} />
      </Group>
      <Text size="sm" c="dimmed">
        {facts.join(' · ')}
      </Text>
    </Stack>
  );
}

function MeetingMenu({ meeting }: { meeting: Meeting }) {
  const user = useUser();
  const navigate = useNavigate();
  const remove = useDeleteMeeting(meeting.id);

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'Delete this meeting?',
      centered: true,
      children: (
        <Text size="sm">
          The recording, the transcript and the minutes are deleted from the server. This cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        remove.mutate(undefined, {
          onSuccess: () => {
            notifySuccess('Meeting deleted.');
            void navigate('/meetings');
          },
        }),
    });

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="default" size="lg" aria-label="Meeting actions" loading={remove.isPending}>
          <IconDotsVertical size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {user.role === 'admin' && (
          <Menu.Item
            component={Link}
            to={`/admin/audit?meeting_id=${encodeURIComponent(meeting.id)}`}
            leftSection={<IconHistory size={16} />}
          >
            Audit trail
          </Menu.Item>
        )}
        <Menu.Item
          color="red"
          leftSection={<IconTrash size={16} />}
          onClick={confirmDelete}
          disabled={meeting.status === 'processing'}
        >
          {meeting.status === 'processing' ? 'Delete (after processing)' : 'Delete meeting'}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function MeetingTabs({ meeting }: { meeting: Meeting }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const canSend = meeting.status !== 'ready';
  const tab: TabName = requested === 'transcript' || (requested === 'send' && canSend) ? requested : 'minutes';

  const select = (value: string | null) =>
    setParams(value && value !== 'minutes' ? { tab: value } : {}, { replace: true });

  return (
    <Tabs value={tab} onChange={select} keepMountedMode="display-none">
      <Tabs.List mb="md">
        <Tabs.Tab value="minutes" leftSection={<IconFileText size={16} />}>
          Minutes
        </Tabs.Tab>
        <Tabs.Tab value="transcript" leftSection={<IconMessages size={16} />}>
          Transcript
        </Tabs.Tab>
        <Tabs.Tab value="send" leftSection={<IconSend size={16} />} disabled={!canSend}>
          Send
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="minutes">
        <MinutesTab meeting={meeting} onApproved={() => select('send')} />
      </Tabs.Panel>
      <Tabs.Panel value="transcript">
        <TranscriptTab meetingId={meeting.id} active={tab === 'transcript'} />
      </Tabs.Panel>
      <Tabs.Panel value="send">
        <SendTab meeting={meeting} active={tab === 'send'} />
      </Tabs.Panel>
    </Tabs>
  );
}

/** One meeting: live progress while processing, then minutes, transcript and sending. */
export function MeetingPage() {
  const { id = '' } = useParams();
  const user = useUser();
  const meeting = useMeeting(id);
  const back = { to: '/meetings', label: 'Meetings' };

  if (meeting.isPending) return <LoadingState />;
  if (meeting.isError) {
    return (
      <>
        <PageHeader title="Meeting" back={back} />
        <ErrorState error={meeting.error} onRetry={() => void meeting.refetch()} />
      </>
    );
  }

  const data = meeting.data;
  // Moderators also see minutes other moderators sent them; those are only for reading.
  if (user.role !== 'admin' && data.created_by.id !== user.id) return <ReceivedMinutes meeting={data} back={back} />;

  return (
    <>
      <PageHeader
        title={data.title || 'Untitled meeting'}
        description={<MeetingFacts meeting={data} />}
        actions={<MeetingMenu meeting={data} />}
        back={back}
      />
      <Stack gap="lg">
        {isProcessing(data.status) && <ProcessingCard meeting={data} />}
        {data.status === 'failed' && (
          <Alert color="red" icon={<IconAlertTriangle />} title="Processing failed">
            {data.error ?? 'The recording could not be processed.'} Check the file and upload it again.
          </Alert>
        )}
        {hasMinutes(data.status) && <MeetingTabs meeting={data} />}
      </Stack>
    </>
  );
}
