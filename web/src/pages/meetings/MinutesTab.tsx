import { Alert, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconArrowBackUp, IconCircleCheck } from '@tabler/icons-react';

import { useMinutes, useReopenMeeting } from '../../api/queries';
import type { Meeting } from '../../api/types';
import { MinutesView } from '../../components/MinutesView';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { formatDateTime } from '../../lib/format';
import { MinutesEditor } from './MinutesEditor';

/** Draft minutes to edit and approve, or the approved / sent minutes read-only. */
export function MinutesTab({ meeting, onApproved }: { meeting: Meeting; onApproved: () => void }) {
  const minutes = useMinutes(meeting.id);
  const reopen = useReopenMeeting(meeting.id);

  if (minutes.isPending) return <LoadingState />;
  if (minutes.isError) return <ErrorState error={minutes.error} onRetry={() => void minutes.refetch()} />;
  if (meeting.status === 'ready') {
    return <MinutesEditor meeting={meeting} minutes={minutes.data} onApproved={onApproved} />;
  }

  const sent = meeting.status === 'sent';
  const approval = `Approved by ${meeting.approved_by?.full_name ?? 'a moderator'} on ${formatDateTime(meeting.approved_at)}.`;
  return (
    <Stack gap="lg">
      <Alert color={sent ? 'green' : 'teal'} icon={<IconCircleCheck />} title={sent ? 'Sent' : 'Approved'}>
        <Group justify="space-between" gap="sm">
          <Text size="sm">
            {approval}{' '}
            {sent ? `Sent on ${formatDateTime(meeting.sent_at)}.` : 'The minutes are read-only until reopened.'}
          </Text>
          {!sent && (
            <Button
              variant="default"
              size="xs"
              leftSection={<IconArrowBackUp size={14} />}
              loading={reopen.isPending}
              onClick={() => reopen.mutate()}
            >
              Reopen for editing
            </Button>
          )}
        </Group>
      </Alert>
      <Paper withBorder p="lg">
        <MinutesView minutes={minutes.data} meetingType={meeting.meeting_type} />
      </Paper>
    </Stack>
  );
}
