import {
  ActionIcon,
  Anchor,
  Button,
  EmptyState,
  Group,
  Menu,
  Paper,
  Progress,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconClipboardList,
  IconDotsVertical,
  IconExternalLink,
  IconMicrophone,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import { useDeleteMeeting, useMeetings } from '../../api/queries';
import type { Meeting, MeetingStatus } from '../../api/types';
import { useUser } from '../../auth/context';
import { MeetingStatusBadge, MeetingTypeBadge } from '../../components/Badges';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { TablePagination } from '../../components/TablePagination';
import { usePaged } from '../../hooks/usePaged';
import { formatDateTime, formatDuration } from '../../lib/format';
import { isProcessing, meetingTypeOptions, STATUS_COLORS, statusLabel } from '../../lib/meeting';
import { notifySuccess } from '../../lib/notify';
import { matchesQuery } from '../../lib/search';

const statusOptions = () =>
  (Object.keys(STATUS_COLORS) as MeetingStatus[]).map((value) => ({ value, label: statusLabel(value) }));

/** The ⋮ menu of a row: open the meeting; delete it for its moderator or an admin (not while it is processed). */
function RowActions({ meeting }: { meeting: Meeting }) {
  const { t } = useTranslation(['meetings', 'common']);
  const user = useUser();
  const navigate = useNavigate();
  const remove = useDeleteMeeting(meeting.id);
  const title = meeting.title || t('untitled');
  const canDelete = user.role === 'admin' || meeting.created_by.id === user.id;
  const busy = isProcessing(meeting.status);

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: t('meetingPage.deleteConfirm.title'),
      centered: true,
      children: <Text size="sm">{t('meetingPage.deleteConfirm.body')}</Text>,
      labels: { confirm: t('common:action.delete'), cancel: t('common:action.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(undefined, { onSuccess: () => notifySuccess(t('meetingPage.deleted')) }),
    });

  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={t('meetingsPage.actions.aria', { title })}
          loading={remove.isPending}
          onClick={(event) => event.stopPropagation()}
        >
          <IconDotsVertical size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
        <Menu.Item
          leftSection={<IconExternalLink size={16} />}
          onClick={() => void navigate(`/meetings/${meeting.id}`)}
        >
          {t('meetingsPage.actions.open')}
        </Menu.Item>
        {canDelete && (
          <Menu.Item color="red" leftSection={<IconTrash size={16} />} disabled={busy} onClick={confirmDelete}>
            {busy ? t('meetingPage.menu.deleteProcessing') : t('meetingPage.menu.delete')}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

/** What is happening with a meeting, in one short line. */
function MeetingProgress({ meeting }: { meeting: Meeting }) {
  const { t } = useTranslation('meetings');
  const { status, progress } = meeting;
  if (status === 'processing' && progress) {
    const percent = progress.total ? (progress.done / progress.total) * 100 : 0;
    return (
      <Stack gap={4} miw={140}>
        <Text size="xs">{progress.message || progress.stage}</Text>
        <Progress value={percent} size="sm" animated={!progress.total} striped={!progress.total} />
      </Stack>
    );
  }
  const text: Record<MeetingStatus, string> = {
    queued: t('meetingsPage.progress.queued'),
    processing: t('meetingsPage.progress.processing'),
    ready: t('meetingsPage.progress.ready'),
    approved: t('meetingsPage.progress.approved'),
    sent: t('meetingsPage.progress.sent', { date: formatDateTime(meeting.sent_at) }),
    failed: meeting.error ?? t('processingFailed'),
  };
  return (
    <Text size="xs" c={status === 'failed' ? 'red' : 'dimmed'} lineClamp={2}>
      {text[status]}
    </Text>
  );
}

export function MeetingsPage() {
  const { t } = useTranslation(['meetings', 'common']);
  const user = useUser();
  const navigate = useNavigate();
  const meetings = useMeetings();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const rows = (meetings.data ?? []).filter(
    (meeting) =>
      (!status || meeting.status === status) &&
      (!type || meeting.meeting_type === type) &&
      matchesQuery(`${meeting.title} ${meeting.created_by.full_name}`, search),
  );
  const paged = usePaged(rows);

  const newMeetingButton = (
    <Button component={Link} to="/meetings/new" leftSection={<IconMicrophone size={18} />}>
      {t('common:nav.newMeeting')}
    </Button>
  );

  const header = (
    <PageHeader
      title={t('common:nav.meetings')}
      description={user.role === 'admin' ? t('meetingsPage.description.admin') : t('meetingsPage.description.user')}
      actions={newMeetingButton}
    />
  );

  if (meetings.isPending)
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  if (meetings.isError)
    return (
      <>
        {header}
        <ErrorState error={meetings.error} onRetry={() => void meetings.refetch()} />
      </>
    );

  if (meetings.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          mt="xl"
          icon={<IconClipboardList />}
          title={t('meetingsPage.emptyTitle')}
          description={t('meetingsPage.emptyDescription')}
        >
          {newMeetingButton}
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {header}
      <Group mb="md" gap="sm" align="flex-end">
        <TextInput
          label={t('common:action.search')}
          placeholder={t('meetingsPage.searchPlaceholder')}
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={{ base: '100%', sm: 260 }}
        />
        <Select
          label={t('meetingsPage.status')}
          placeholder={t('meetingsPage.anyStatus')}
          data={statusOptions()}
          value={status}
          onChange={setStatus}
          clearable
          w={180}
        />
        <Select
          label={t('meetingsPage.type')}
          placeholder={t('meetingsPage.anyType')}
          data={meetingTypeOptions()}
          value={type}
          onChange={setType}
          clearable
          w={180}
        />
      </Group>
      <Paper withBorder>
        <Table.ScrollContainer minWidth={820}>
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('meetingsPage.table.title')}</Table.Th>
                <Table.Th>{t('meetingsPage.table.type')}</Table.Th>
                <Table.Th>{t('meetingsPage.table.status')}</Table.Th>
                <Table.Th>{t('meetingsPage.table.progress')}</Table.Th>
                <Table.Th>{t('meetingsPage.table.date')}</Table.Th>
                <Table.Th>{t('meetingsPage.table.owner')}</Table.Th>
                <Table.Th>{t('meetingsPage.table.length')}</Table.Th>
                <Table.Th w={64}>
                  <Text size="sm" fw={700} ta="center">
                    {t('meetingsPage.table.actions')}
                  </Text>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paged.items.map((meeting) => (
                <Table.Tr
                  key={meeting.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => void navigate(`/meetings/${meeting.id}`)}
                >
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to={`/meetings/${meeting.id}`}
                      size="sm"
                      fw={600}
                      lineClamp={2}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {meeting.title || t('untitled')}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <MeetingTypeBadge type={meeting.meeting_type} />
                  </Table.Td>
                  <Table.Td>
                    <MeetingStatusBadge status={meeting.status} />
                  </Table.Td>
                  <Table.Td maw={260}>
                    <MeetingProgress meeting={meeting} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(meeting.created_at)}
                    </Text>
                  </Table.Td>
                  <Table.Td>{meeting.created_by.full_name}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDuration(meeting.duration_s)}</Table.Td>
                  <Table.Td ta="center">
                    <RowActions meeting={meeting} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {rows.length === 0 && (
          <Text c="dimmed" ta="center" py="lg" size="sm">
            {t('meetingsPage.noMatches')}
          </Text>
        )}
      </Paper>
      <TablePagination paged={paged} />
    </>
  );
}
