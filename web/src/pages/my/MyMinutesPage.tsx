import { Card, EmptyState, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconInbox } from '@tabler/icons-react';
import { Link } from 'react-router';

import { useMeetings } from '../../api/queries';
import { MeetingTypeBadge } from '../../components/Badges';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { formatDateTime } from '../../lib/format';

/** The minutes that were sent to the signed-in user, newest first. */
export function MyMinutesPage() {
  const meetings = useMeetings();
  const header = <PageHeader title="My minutes" description="Minutes of the meetings that were sent to you." />;

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
        <EmptyState
          mt="xl"
          icon={<IconInbox />}
          title="Nothing yet"
          description="Minutes appear here once a moderator sends them to you."
        />
      </>
    );
  }

  return (
    <>
      {header}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {meetings.data.map((meeting) => (
          <Card
            key={meeting.id}
            withBorder
            padding="lg"
            component={Link}
            to={`/my-minutes/${meeting.id}`}
            aria-label={`Open the minutes of ${meeting.title || 'the meeting'}`}
          >
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600} lineClamp={2}>
                  {meeting.title || 'Minutes of Meeting'}
                </Text>
                <MeetingTypeBadge type={meeting.meeting_type} />
              </Group>
              <Text size="sm" c="dimmed">
                Sent {formatDateTime(meeting.sent_at)} by {meeting.created_by.full_name}
              </Text>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </>
  );
}
