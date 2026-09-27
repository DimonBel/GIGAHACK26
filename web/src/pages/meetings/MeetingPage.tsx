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
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { useDeleteMeeting, useMeeting } from '../../api/queries';
import type { Meeting } from '../../api/types';
import { useUser } from '../../auth/context';
import { MeetingStatusBadge, MeetingTypeBadge } from '../../components/Badges';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { ReceivedMinutes } from '../../components/ReceivedMinutes';
import { useSuccessHold } from '../../hooks/useSuccessHold';
import { formatDateTime, formatDuration } from '../../lib/format';
import { isMinutesLanguage, languageLabel } from '../../lib/languages';
import { hasMinutes, isProcessing } from '../../lib/meeting';
import { notifySuccess } from '../../lib/notify';
import { MinutesTab } from './MinutesTab';
import { ProcessingCard } from './ProcessingCard';
import { SendTab } from './SendTab';
import { TranscriptTab } from './TranscriptTab';

type TabName = 'minutes' | 'transcript' | 'send';

function MeetingFacts({ meeting }: { meeting: Meeting }) {
  const { t } = useTranslation('meetings');
  const facts = [
    t('meetingPage.facts.by', { name: meeting.created_by.full_name }),
    formatDateTime(meeting.created_at),
    meeting.duration_s !== null && t('meetingPage.facts.length', { duration: formatDuration(meeting.duration_s) }),
    meeting.language &&
      (isMinutesLanguage(meeting.language)
        ? t(`meetingPage.facts.spoken.${meeting.language}`)
        : t('meetingPage.facts.language', { language: languageLabel(meeting.language) })),
    meeting.minutes_language && t(`meetingPage.facts.minutesIn.${meeting.minutes_language}`),
    meeting.timings?.total_s &&
      t('meetingPage.facts.processedIn', { duration: formatDuration(meeting.timings.total_s) }),
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
  const { t } = useTranslation(['meetings', 'common']);
  const user = useUser();
  const navigate = useNavigate();
  const remove = useDeleteMeeting(meeting.id);

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: t('meetingPage.deleteConfirm.title'),
      centered: true,
      children: <Text size="sm">{t('meetingPage.deleteConfirm.body')}</Text>,
      labels: { confirm: t('common:action.delete'), cancel: t('common:action.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        remove.mutate(undefined, {
          onSuccess: () => {
            notifySuccess(t('meetingPage.deleted'));
            void navigate('/meetings');
          },
        }),
    });

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="default" size="lg" aria-label={t('meetingPage.menu.aria')} loading={remove.isPending}>
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
            {t('common:nav.audit')}
          </Menu.Item>
        )}
        <Menu.Item
          color="red"
          leftSection={<IconTrash size={16} />}
          onClick={confirmDelete}
          disabled={meeting.status === 'processing'}
        >
          {meeting.status === 'processing' ? t('meetingPage.menu.deleteProcessing') : t('meetingPage.menu.delete')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function MeetingTabs({ meeting }: { meeting: Meeting }) {
  const { t } = useTranslation('meetings');
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const canSend = meeting.status !== 'ready';
  const tab: TabName = requested === 'transcript' || (requested === 'send' && canSend) ? requested : 'minutes';

  const select = (value: string | null) =>
    setParams(value && value !== 'minutes' ? { tab: value } : {}, { replace: true });

  return (
    <Tabs value={tab} onChange={select} keepMountedMode="display-none">
      <Tabs.List mb="md" className="no-print">
        <Tabs.Tab value="minutes" leftSection={<IconFileText size={16} />}>
          {t('meetingPage.tabs.minutes')}
        </Tabs.Tab>
        <Tabs.Tab value="transcript" leftSection={<IconMessages size={16} />}>
          {t('meetingPage.tabs.transcript')}
        </Tabs.Tab>
        <Tabs.Tab value="send" leftSection={<IconSend size={16} />} disabled={!canSend}>
          {t('meetingPage.tabs.send')}
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="minutes">
        <MinutesTab meeting={meeting} active={tab === 'minutes'} onApproved={() => select('send')} />
      </Tabs.Panel>
      <Tabs.Panel value="transcript">
        <TranscriptTab meetingId={meeting.id} active={tab === 'transcript'} hasAudio={meeting.has_audio} />
      </Tabs.Panel>
      <Tabs.Panel value="send">
        <SendTab meeting={meeting} active={tab === 'send'} />
      </Tabs.Panel>
    </Tabs>
  );
}

/** One meeting: live progress while processing, then minutes, transcript and sending. */
export function MeetingPage() {
  const { t } = useTranslation(['meetings', 'common']);
  const { id = '' } = useParams();
  const user = useUser();
  const meeting = useMeeting(id);
  // Keeps the processing card on screen a moment longer after it finishes, for its success beat.
  const holding = useSuccessHold(meeting.data?.status);
  const back = { to: '/meetings', label: t('common:nav.meetings') };

  if (meeting.isPending) return <LoadingState />;
  if (meeting.isError) {
    return (
      <>
        <PageHeader title={t('meetingPage.title')} back={back} />
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
        title={data.title || t('untitled')}
        description={<MeetingFacts meeting={data} />}
        actions={<MeetingMenu meeting={data} />}
        back={back}
      />
      <Stack gap="lg">
        {(isProcessing(data.status) || holding) && <ProcessingCard meeting={data} done={!isProcessing(data.status)} />}
        {data.status === 'failed' && (
          <Alert color="red" icon={<IconAlertTriangle />} title={t('processingFailed')}>
            {data.error ?? t('meetingPage.failedAlert.fallback')} {t('meetingPage.failedAlert.suffix')}
          </Alert>
        )}
        {hasMinutes(data.status) && !holding && <MeetingTabs meeting={data} />}
      </Stack>
    </>
  );
}
