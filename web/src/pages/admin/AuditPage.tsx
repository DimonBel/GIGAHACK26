import { Anchor, Badge, Group, Pagination, Paper, Select, Table, Text, TextInput } from '@mantine/core';
import type { MantineColor } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { useAudit } from '../../api/queries';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { formatDateTime } from '../../lib/format';
import { matchesQuery } from '../../lib/search';

const PAGE_SIZE = 50;
const FILTER_DELAY_MS = 400;
const KNOWN_ACTIONS = [
  'login',
  'login_failed',
  'password_change',
  'password_change_failed',
  'upload',
  'view_transcript',
  'view_audio',
  'view_minutes',
  'edit_minutes',
  'approve',
  'reopen',
  'send',
  'send_failed',
  'delete',
  'user_create',
  'user_update',
  'user_delete',
  'list_create',
  'list_update',
  'list_delete',
  'settings',
];

function actionColor(action: string): MantineColor {
  if (action.endsWith('_failed')) return 'red';
  if (action === 'send' || action === 'approve') return 'green';
  if (action === 'delete' || action.endsWith('_delete')) return 'orange';
  if (action.startsWith('user_') || action.startsWith('list_') || action === 'settings') return 'grape';
  return 'gray';
}

/** Who did what and when; filtered by meeting on the server, by action and person here. */
export function AuditPage() {
  const [params, setParams] = useSearchParams();
  const meetingId = params.get('meeting_id') ?? '';
  const [meetingInput, setMeetingInput] = useState(meetingId);
  const [action, setAction] = useState<string | null>(null);
  const [person, setPerson] = useState('');
  const [page, setPage] = useState(1);
  const audit = useAudit(meetingId);

  const applyMeeting = useDebouncedCallback((value: string) => {
    setParams(value.trim() ? { meeting_id: value.trim() } : {}, { replace: true });
    setPage(1);
  }, FILTER_DELAY_MS);

  const header = <PageHeader title="Audit log" description="Sign-ins, uploads, views, edits, approvals and emails." />;
  const filters = (
    <Group mb="md" gap="sm" align="flex-end">
      <TextInput
        label="Meeting ID"
        placeholder="Any meeting"
        value={meetingInput}
        onChange={(event) => {
          setMeetingInput(event.currentTarget.value);
          applyMeeting(event.currentTarget.value);
        }}
        w={{ base: '100%', sm: 320 }}
      />
      <Select
        label="Action"
        placeholder="Any action"
        data={[...new Set([...KNOWN_ACTIONS, ...(audit.data ?? []).map((entry) => entry.action)])]}
        value={action}
        onChange={(value) => {
          setAction(value);
          setPage(1);
        }}
        searchable
        clearable
        w={200}
      />
      <TextInput
        label="User"
        placeholder="Email"
        leftSection={<IconSearch size={16} />}
        value={person}
        onChange={(event) => {
          setPerson(event.currentTarget.value);
          setPage(1);
        }}
        w={{ base: '100%', sm: 240 }}
      />
    </Group>
  );

  if (audit.isPending)
    return (
      <>
        {header}
        {filters}
        <LoadingState />
      </>
    );
  if (audit.isError) {
    return (
      <>
        {header}
        {filters}
        <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
      </>
    );
  }

  const rows = audit.data.filter(
    (entry) => (!action || entry.action === action) && matchesQuery(entry.user ?? '', person),
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      {header}
      {filters}
      <Paper withBorder>
        <Table.ScrollContainer minWidth={820}>
          <Table verticalSpacing="xs" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={180}>Time</Table.Th>
                <Table.Th>User</Table.Th>
                <Table.Th>Action</Table.Th>
                <Table.Th>Meeting</Table.Th>
                <Table.Th>Detail</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((entry) => (
                <Table.Tr key={entry.id}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.at)}</Table.Td>
                  <Table.Td>{entry.user ?? '—'}</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={actionColor(entry.action)}>
                      {entry.action}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {entry.meeting_id ? (
                      <Anchor component={Link} to={`/meetings/${entry.meeting_id}`} size="sm" ff="monospace">
                        {entry.meeting_id.slice(0, 8)}
                      </Anchor>
                    ) : (
                      '—'
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={2} title={entry.detail}>
                      {entry.detail || '—'}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {rows.length === 0 && (
          <Text c="dimmed" ta="center" py="lg" size="sm">
            No entries.
          </Text>
        )}
      </Paper>
      <Group justify="space-between" mt="md">
        <Text size="xs" c="dimmed">
          {rows.length} of the latest {audit.data.length} entries
        </Text>
        {pages > 1 && <Pagination total={pages} value={page} onChange={setPage} size="sm" />}
      </Group>
    </>
  );
}
