import { Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconArrowBackUp, IconCircleCheck, IconMailCheck } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useMinutes, useReopenMeeting } from '../../api/queries';
import type { Meeting, Minutes } from '../../api/types';
import { MinutesDocument } from '../../components/minutes/MinutesDocument';
import { MinutesView } from '../../components/MinutesView';
import { PdfButton } from '../../components/PdfButton';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { formatDateTime } from '../../lib/format';
import { toFormValues } from '../../lib/minutesForm';
import { MinutesEditor } from './MinutesEditor';
import { EmailPreviewButton } from './EmailPreview';

/** Approved or sent: who approved them, when and to how many they were sent. */
function ApprovalBar({ meeting }: { meeting: Meeting }) {
  const { t } = useTranslation('meetings');
  const reopen = useReopenMeeting(meeting.id);
  const sent = meeting.status === 'sent';
  const recipients = meeting.recipients ? meeting.recipients.to.length + meeting.recipients.cc.length : 0;
  const title = sent
    ? t('minutesTab.approvalBar.sentTitle', { date: formatDateTime(meeting.sent_at) }) +
      (recipients ? ` ${t('minutesTab.approvalBar.sentToCount', { count: recipients })}` : '')
    : t('minutesTab.approvalBar.approvedTitle');
  const subtitle = t(sent ? 'minutesTab.approvalBar.sentSubtitle' : 'minutesTab.approvalBar.approvedSubtitle', {
    name: meeting.approved_by?.full_name ?? t('minutesTab.approvalBar.defaultApprover'),
    date: formatDateTime(meeting.approved_at),
  });
  return (
    <Paper withBorder p="sm" bg={sent ? 'green.0' : 'teal.0'} className="no-print">
      <Group justify="space-between" gap="sm">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon variant="light" color={sent ? 'green' : 'teal'} radius="xl">
            {sent ? <IconMailCheck size={18} /> : <IconCircleCheck size={18} />}
          </ThemeIcon>
          <Stack gap={0}>
            <Text size="sm" fw={600}>
              {title}
            </Text>
            <Text size="xs" c="dimmed">
              {subtitle}
            </Text>
          </Stack>
        </Group>
        <Group gap="xs">
          <EmailPreviewButton meetingId={meeting.id} />
          <PdfButton meetingId={meeting.id} />
          {!sent && (
            <Button
              variant="default"
              leftSection={<IconArrowBackUp size={14} />}
              loading={reopen.isPending}
              onClick={() => reopen.mutate()}
            >
              {t('minutesTab.approvalBar.reopen')}
            </Button>
          )}
        </Group>
      </Group>
    </Paper>
  );
}

function ApprovedMinutes({ meeting, minutes }: { meeting: Meeting; minutes: Minutes }) {
  const values = useMemo(() => toFormValues(minutes), [minutes]);
  return (
    <Stack gap="md">
      <ApprovalBar meeting={meeting} />
      <div className="screen-only">
        <MinutesDocument values={values} meetingType={meeting.meeting_type} transcriptOf={meeting.id} />
      </div>
      <div className="print-only">
        <MinutesView
          minutes={minutes}
          meetingType={meeting.meeting_type}
          language={meeting.minutes_language}
          meeting={meeting}
        />
      </div>
    </Stack>
  );
}

interface MinutesTabProps {
  meeting: Meeting;
  /** The tab is the one shown. */
  active: boolean;
  onApproved: () => void;
}

/** Draft minutes to read, edit and approve, or the approved / sent minutes read-only (printed whole). */
export function MinutesTab({ meeting, active, onApproved }: MinutesTabProps) {
  const minutes = useMinutes(meeting.id);

  if (minutes.isPending) return <LoadingState />;
  if (minutes.isError) return <ErrorState error={minutes.error} onRetry={() => void minutes.refetch()} />;
  if (meeting.status === 'ready') {
    return <MinutesEditor meeting={meeting} minutes={minutes.data} active={active} onApproved={onApproved} />;
  }
  return <ApprovedMinutes meeting={meeting} minutes={minutes.data} />;
}
