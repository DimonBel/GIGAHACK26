import { Button, Paper } from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';

import { useSentMinutes } from '../api/queries';
import type { Meeting } from '../api/types';
import { formatDateTime } from '../lib/format';
import { MinutesView } from './MinutesView';
import { PageHeader } from './PageHeader';
import { ErrorState, LoadingState } from './QueryState';

/** Minutes someone received by email, read-only and printable. */
export function ReceivedMinutes({ meeting, back }: { meeting: Meeting; back: { to: string; label: string } }) {
  const minutes = useSentMinutes(meeting.id);
  return (
    <>
      <PageHeader
        title={meeting.title || 'Minutes of Meeting'}
        description={`Sent ${formatDateTime(meeting.sent_at)} by ${meeting.created_by.full_name}`}
        actions={
          <Button variant="default" leftSection={<IconPrinter size={16} />} onClick={() => window.print()}>
            Print
          </Button>
        }
        back={back}
      />
      {minutes.isPending ? (
        <LoadingState />
      ) : minutes.isError ? (
        <ErrorState error={minutes.error} onRetry={() => void minutes.refetch()} />
      ) : (
        <Paper withBorder p="lg">
          <MinutesView minutes={minutes.data} meetingType={meeting.meeting_type} />
        </Paper>
      )}
    </>
  );
}
