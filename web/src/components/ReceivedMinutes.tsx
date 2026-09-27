import { Paper } from '@mantine/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useSentMinutes } from '../api/queries';
import type { Meeting, Minutes } from '../api/types';
import { formatDateTime } from '../lib/format';
import { toFormValues } from '../lib/minutesForm';
import { MinutesDocument } from './minutes/MinutesDocument';
import { MinutesView } from './MinutesView';
import { PageHeader } from './PageHeader';
import { PdfButton } from './PdfButton';
import { ErrorState, LoadingState } from './QueryState';

/** On screen a document to move through; printed, everything on one page. */
function ReceivedDocument({ meeting, minutes }: { meeting: Meeting; minutes: Minutes }) {
  const values = useMemo(() => toFormValues(minutes), [minutes]);
  return (
    <>
      <div className="screen-only">
        <MinutesDocument values={values} meetingType={meeting.meeting_type} />
      </div>
      <Paper className="print-only" p={0}>
        <MinutesView
          minutes={minutes}
          meetingType={meeting.meeting_type}
          language={meeting.minutes_language}
          meeting={meeting}
        />
      </Paper>
    </>
  );
}

/** Minutes someone received by email, read-only and printable. */
export function ReceivedMinutes({ meeting, back }: { meeting: Meeting; back: { to: string; label: string } }) {
  const { t } = useTranslation(['my', 'common']);
  const minutes = useSentMinutes(meeting.id);
  return (
    <>
      <PageHeader
        title={meeting.title || t('untitled')}
        description={t('sent', { date: formatDateTime(meeting.sent_at), name: meeting.created_by.full_name })}
        actions={<PdfButton meetingId={meeting.id} />}
        back={back}
      />
      {minutes.isPending ? (
        <LoadingState />
      ) : minutes.isError ? (
        <ErrorState error={minutes.error} onRetry={() => void minutes.refetch()} />
      ) : (
        <ReceivedDocument meeting={meeting} minutes={minutes.data} />
      )}
    </>
  );
}
