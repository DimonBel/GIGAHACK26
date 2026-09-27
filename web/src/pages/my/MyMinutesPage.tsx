import { Card, EmptyState, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconInbox, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useMeetings } from '../../api/queries';
import { MeetingTypeBadge } from '../../components/Badges';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { TablePagination } from '../../components/TablePagination';
import { PAGE_SIZES, usePaged } from '../../hooks/usePaged';
import { formatDateTime } from '../../lib/format';
import { matchesQuery } from '../../lib/search';

/** The minutes that were sent to the signed-in user, newest first. */
export function MyMinutesPage() {
  const { t } = useTranslation('my');
  const meetings = useMeetings();
  const [query, setQuery] = useState('');
  const sent = [...(meetings.data ?? [])]
    .sort((a, b) => (b.sent_at ?? '').localeCompare(a.sent_at ?? ''))
    .filter((meeting) => matchesQuery(meeting.title, query));
  const paged = usePaged(sent, PAGE_SIZES[0]);
  const header = <PageHeader title={t('title')} description={t('description')} />;

  if (meetings.isPending)
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  if (meetings.isError) {
    return (
      <>
        {header}
        <ErrorState error={meetings.error} onRetry={() => void meetings.refetch()} />
      </>
    );
  }
  if (meetings.data.length === 0) {
    return (
      <>
        {header}
        <EmptyState mt="xl" icon={<IconInbox />} title={t('emptyTitle')} description={t('emptyDescription')} />
      </>
    );
  }

  return (
    <>
      {header}
      <TextInput
        placeholder={t('search')}
        aria-label={t('search')}
        leftSection={<IconSearch size={16} />}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        maw={420}
        mb="md"
      />
      {sent.length === 0 && (
        <Text c="dimmed" size="sm">
          {t('noMatch')}
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {paged.items.map((meeting) => (
          <Card
            key={meeting.id}
            withBorder
            padding="lg"
            component={Link}
            to={`/my-minutes/${meeting.id}`}
            aria-label={t('open', { title: meeting.title || t('untitled') })}
          >
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600} lineClamp={2}>
                  {meeting.title || t('untitled')}
                </Text>
                <MeetingTypeBadge type={meeting.meeting_type} />
              </Group>
              <Text size="sm" c="dimmed">
                {t('sent', { date: formatDateTime(meeting.sent_at), name: meeting.created_by.full_name })}
              </Text>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
      <TablePagination paged={paged} />
    </>
  );
}
