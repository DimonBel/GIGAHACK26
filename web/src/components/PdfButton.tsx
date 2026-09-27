import { Button, type ButtonProps } from '@mantine/core';
import { IconFileTypePdf } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { meetingsApi } from '../api/endpoints';

/** Opens the minutes as the PDF that is emailed, in a new tab (the browser's viewer prints and saves it). */
export function PdfButton({ meetingId, ...props }: { meetingId: string } & ButtonProps) {
  const { t } = useTranslation('common');
  return (
    <Button
      component="a"
      href={meetingsApi.pdfUrl(meetingId)}
      target="_blank"
      rel="noopener"
      variant="default"
      leftSection={<IconFileTypePdf size={16} />}
      {...props}
    >
      {t('action.openPdf')}
    </Button>
  );
}
