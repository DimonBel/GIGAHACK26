import { Button, Group, Modal, Paper, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconEye, IconPaperclip } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { meetingsApi } from '../../api/endpoints';
import { useEmailPreview } from '../../api/queries';
import { PdfButton } from '../../components/PdfButton';
import { ErrorState, LoadingState } from '../../components/QueryState';

/** The email as the server renders it now: its short note, then the minutes as the PDF it carries. */
function PreviewBody({ meetingId }: { meetingId: string }) {
  const { t } = useTranslation('meetings');
  const preview = useEmailPreview(meetingId);
  if (preview.isPending) return <LoadingState />;
  if (preview.isError) return <ErrorState error={preview.error} onRetry={() => void preview.refetch()} />;
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-end" gap="sm">
        <Stack gap={0} miw={0}>
          <Text size="xs" c="dimmed">
            {t('preview.subject')}
          </Text>
          <Text fw={600} truncate>
            {preview.data.subject}
          </Text>
        </Stack>
        <PdfButton meetingId={meetingId} />
      </Group>
      <EmailNote text={preview.data.text} />
      <Group gap={6} wrap="nowrap" miw={0}>
        <IconPaperclip size={14} color="var(--mantine-color-dimmed)" aria-hidden />
        <Text size="sm" c="dimmed" truncate>
          {t('preview.attachment')}: {preview.data.attachment}
        </Text>
      </Group>
      <iframe
        title={t('preview.pdf')}
        src={meetingsApi.pdfUrl(meetingId)}
        style={{ width: '100%', height: '60vh', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8 }}
      />
      <Text size="xs" c="dimmed">
        {t('preview.note')}
      </Text>
    </Stack>
  );
}

/** The note the email says, as its plain text part reads (the HTML one says the same). */
export function EmailNote({ text }: { text: string }) {
  return (
    <Paper withBorder p="md" bg="gray.0">
      <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
        {text.trim()}
      </Text>
    </Paper>
  );
}

/** "Preview email": what the moderator approves, exactly as it will be emailed. beforeOpen (saving changes first)
 *  may cancel by returning false. */
export function EmailPreviewButton({
  meetingId,
  beforeOpen,
  disabled,
}: {
  meetingId: string;
  beforeOpen?: () => Promise<boolean>;
  disabled?: boolean;
}) {
  const { t } = useTranslation('meetings');
  const [opened, { open, close }] = useDisclosure();
  return (
    <>
      <Button
        variant="default"
        leftSection={<IconEye size={16} />}
        disabled={disabled}
        onClick={() => void (beforeOpen ? beforeOpen() : Promise.resolve(true)).then((ok) => ok && open())}
      >
        {t('preview.button')}
      </Button>
      <Modal opened={opened} onClose={close} size="xl" title={t('preview.title')} centered>
        {opened && <PreviewBody meetingId={meetingId} />}
      </Modal>
    </>
  );
}
