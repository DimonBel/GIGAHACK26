import {
  Anchor,
  Button,
  EmptyState,
  Group,
  Paper,
  Progress,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { IconClipboardList, IconMicrophone, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { useMeetings } from '../../api/queries';
import type { Meeting, MeetingStatus } from '../../api/types';
import { useUser } from '../../auth/context';
import { MeetingStatusBadge, MeetingTypeBadge } from '../../components/Badges';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { formatDateTime, formatDuration } from '../../lib/format';
import { MEETING_TYPES, STATUS_META } from '../../lib/meeting';
import { matchesQuery } from '../../lib/search';

const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, { label }]) => ({ value, label }));

/** What is happening with a meeting, in one short line. */
function MeetingProgress({ meeting }: { meeting: Meeting }) {
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
    queued: 'Waiting in the queue',
    processing: 'Starting',
    ready: 'Draft minutes to review',
    approved: 'Approved, ready to send',
    sent: `Sent ${formatDateTime(meeting.sent_at)}`,
    failed: meeting.error ?? 'Processing failed',
  };
  return (
    <Text size="xs" c={status === 'failed' ? 'red' : 'dimmed'} lineClamp={2}>
      {text[status]}
    </Text>
  );
}

export function MeetingsPage() {
  const user = useUser();
  const navigate = useNavigate();
  const meetings = useMeetings();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);

  const newMeetingButton = (
    <Button component={Link} to="/meetings/new" leftSection={<IconMicrophone size={18} />}>
      New meeting
    </Button>
  );

  const header = (
    <PageHeader
      title="Meetings"
      description={
        user.role === 'admin' ? 'The meetings of all moderators.' : 'Your meetings, and the minutes sent to you.'
      }
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
          title="No meetings yet"
          description="Upload a recording or record a meeting to get draft minutes."
        >
          {newMeetingButton}
        </EmptyState>
      </>
    );
  }

  const rows = meetings.data.filter(
    (meeting) =>
      (!status || meeting.status === status) &&
      (!type || meeting.meeting_type === type) &&
      matchesQuery(`${meeting.title} ${meeting.created_by.full_name}`, search),
  );

  return (
    <>
      {header}
      <Group mb="md" gap="sm" align="flex-end">
        <TextInput
          label="Search"
          placeholder="Title or owner"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={{ base: '100%', sm: 260 }}
        />
        <Select
          label="Status"
          placeholder="Any status"
          data={STATUS_OPTIONS}
          value={status}
          onChange={setStatus}
          clearable
          w={180}
        />
        <Select
          label="Type"
          placeholder="Any type"
          data={MEETING_TYPES}
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
                <Table.Th>Title</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Progress</Table.Th>
                <Table.Th>Date</Table.Th>
                <Table.Th>Owner</Table.Th>
                <Table.Th>Length</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((meeting) => (
                <Table.Tr
                  key={meeting.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => void navigate(`/meetings/${meeting.id}`)}
                >
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to={`/meetings/${meeting.id}`}
                      fw={600}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {meeting.title || 'Untitled meeting'}
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
                  <Table.Td>{formatDuration(meeting.duration_s)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {rows.length === 0 && (
          <Text c="dimmed" ta="center" py="lg" size="sm">
            No meeting matches these filters.
          </Text>
        )}
      </Paper>
    </>
  );
}
