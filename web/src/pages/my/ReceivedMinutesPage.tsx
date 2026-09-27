import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useMeeting } from '../../api/queries';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { ReceivedMinutes } from '../../components/ReceivedMinutes';

export function ReceivedMinutesPage() {
  const { t } = useTranslation('my');
  const { id = '' } = useParams();
  const back = { to: '/my-minutes', label: t('title') };
  const meeting = useMeeting(id);

  if (meeting.isPending) return <LoadingState />;
  if (meeting.isError) {
    return (
      <>
        <PageHeader title={t('minutes')} back={back} />
        <ErrorState error={meeting.error} />
      </>
    );
  }
  return <ReceivedMinutes meeting={meeting.data} back={back} />;
}
