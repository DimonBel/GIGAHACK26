import { Anchor, Badge, Group, Paper, Select, Table, Text, TextInput } from '@mantine/core';
import type { MantineColor } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';

import { useAudit } from '../../api/queries';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { TablePagination } from '../../components/TablePagination';
import { usePaged } from '../../hooks/usePaged';
import { formatDateTime } from '../../lib/format';
import { matchesQuery } from '../../lib/search';

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
] as const;

function actionColor(action: string): MantineColor {
  if (action.endsWith('_failed')) return 'red';
  if (action === 'send' || action === 'approve') return 'green';
  if (action === 'delete' || action.endsWith('_delete')) return 'orange';
  if (action.startsWith('user_') || action.startsWith('list_') || action === 'settings') return 'grape';
  return 'gray';
}

/** Every known action, translated; an action the server added later falls back to its raw code. */
function actionLabels(t: TFunction<['admin', 'common']>): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const action of KNOWN_ACTIONS) labels[action] = t(`audit.actionLabel.${action}`, { ns: 'admin' });
  return labels;
}

/** Who did what and when; filtered by meeting on the server, by action and person here. */
export function AuditPage() {
  const { t } = useTranslation(['admin', 'common']);
  const [params, setParams] = useSearchParams();
  const meetingId = params.get('meeting_id') ?? '';
  const [meetingInput, setMeetingInput] = useState(meetingId);
  const [action, setAction] = useState<string | null>(null);
  const [person, setPerson] = useState('');
  const audit = useAudit(meetingId);
  const labels = actionLabels(t);

  const applyMeeting = useDebouncedCallback((value: string) => {
    setParams(value.trim() ? { meeting_id: value.trim() } : {}, { replace: true });
  }, FILTER_DELAY_MS);

  const header = <PageHeader title={t('common:nav.audit')} description={t('audit.description', { ns: 'admin' })} />;
  const filters = (
    <Group mb="md" gap="sm" align="flex-end">
      <TextInput
        label={t('audit.meetingId', { ns: 'admin' })}
        placeholder={t('audit.anyMeeting', { ns: 'admin' })}
        value={meetingInput}
        onChange={(event) => {
          setMeetingInput(event.currentTarget.value);
          applyMeeting(event.currentTarget.value);
        }}
        w={{ base: '100%', sm: 320 }}
      />
      <Select
        label={t('audit.action', { ns: 'admin' })}
        placeholder={t('audit.anyAction', { ns: 'admin' })}
        data={[...new Set([...KNOWN_ACTIONS, ...(audit.data ?? []).map((entry) => entry.action)])].map((value) => ({
          value,
          label: labels[value] ?? value,
        }))}
        value={action}
        onChange={setAction}
        searchable
        clearable
        w={200}
      />
      <TextInput
        label={t('audit.user', { ns: 'admin' })}
        placeholder={t('audit.userPlaceholder', { ns: 'admin' })}
        leftSection={<IconSearch size={16} />}
        value={person}
        onChange={(event) => setPerson(event.currentTarget.value)}
        w={{ base: '100%', sm: 240 }}
      />
    </Group>
  );

  const rows = (audit.data ?? []).filter(
    (entry) => (!action || entry.action === action) && matchesQuery(entry.user ?? '', person),
  );
  const paged = usePaged(rows);

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

  return (
    <>
      {header}
      {filters}
      <Paper withBorder>
        <Table.ScrollContainer minWidth={820}>
          <Table verticalSpacing="xs" striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={180}>{t('audit.table.time', { ns: 'admin' })}</Table.Th>
                <Table.Th>{t('audit.table.user', { ns: 'admin' })}</Table.Th>
                <Table.Th>{t('audit.table.action', { ns: 'admin' })}</Table.Th>
                <Table.Th>{t('audit.table.meeting', { ns: 'admin' })}</Table.Th>
                <Table.Th>{t('audit.table.detail', { ns: 'admin' })}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paged.items.map((entry) => (
                <Table.Tr key={entry.id}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.at)}</Table.Td>
                  <Table.Td>{entry.user ?? '—'}</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={actionColor(entry.action)}>
                      {labels[entry.action] ?? entry.action}
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
            {t('audit.empty', { ns: 'admin' })}
          </Text>
        )}
      </Paper>
      <TablePagination paged={paged} />
    </>
  );
}
