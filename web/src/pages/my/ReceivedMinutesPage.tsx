import { useParams } from 'react-router';

import { useMeeting } from '../../api/queries';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { ReceivedMinutes } from '../../components/ReceivedMinutes';

const BACK = { to: '/my-minutes', label: 'My minutes' };

export function ReceivedMinutesPage() {
  const { id = '' } = useParams();
  const meeting = useMeeting(id);

  if (meeting.isPending) return <LoadingState />;
  if (meeting.isError) {
    return (
      <>
        <PageHeader title="Minutes" back={BACK} />
        <ErrorState error={meeting.error} />
      </>
    );
  }
  return <ReceivedMinutes meeting={meeting.data} back={BACK} />;
}
