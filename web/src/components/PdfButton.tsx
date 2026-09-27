import { Button, type ButtonProps, Menu } from '@mantine/core';
import { IconChevronDown, IconDownload, IconFileTypePdf, IconListDetails } from '@tabler/icons-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { meetingsApi } from '../api/endpoints';

interface PdfButtonProps extends ButtonProps {
  meetingId: string;
  /** Before the PDF is made (saving unsaved edits, so it shows them); false cancels. */
  beforeOpen?: () => Promise<boolean>;
  /** Also offer the full minutes (every topic with its details): for the moderator. */
  full?: boolean;
}

/** "Export PDF": the minutes on one page, as they are emailed, opened in a new tab (the browser's viewer prints and
 *  saves it); a button next to it downloads the file, and for the moderator a menu gives the full minutes. */
export function PdfButton({ meetingId, beforeOpen, full = false, disabled, size, ...props }: PdfButtonProps) {
  const { t } = useTranslation('common');
  const url = (options: { download?: boolean; full?: boolean } = {}) => meetingsApi.pdfUrl(meetingId, options);

  // The tab opens at once (one opened after waiting for the save is blocked as a popup) and loads the PDF once saved.
  const follow = (target: string, newTab: boolean) =>
    beforeOpen
      ? (event: MouseEvent) => {
          event.preventDefault();
          const tab = newTab ? window.open('', '_blank') : null;
          if (tab) tab.opener = null;
          void beforeOpen().then((ok) => {
            if (!ok) tab?.close();
            else if (tab) tab.location.href = target;
            else if (!newTab) window.location.assign(target);
          });
        }
      : undefined;
  const opened = (target: string) => ({ href: target, onClick: follow(target, true) });
  const saved = (target: string) => ({ href: target, onClick: follow(target, false) });

  return (
    <Button.Group>
      <Button
        component="a"
        {...opened(url())}
        target="_blank"
        rel="noopener"
        variant="default"
        size={size}
        disabled={disabled}
        title={t('action.exportPdfHint')}
        leftSection={<IconFileTypePdf size={16} />}
        {...props}
      >
        {t('action.exportPdf')}
      </Button>
      <Button
        component="a"
        {...saved(url({ download: true }))}
        variant="default"
        size={size}
        px="xs"
        disabled={disabled}
        aria-label={t('action.downloadPdf')}
        title={t('action.downloadPdf')}
      >
        <IconDownload size={16} />
      </Button>
      {full && (
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <Button variant="default" size={size} px="xs" disabled={disabled} aria-label={t('action.fullPdfMenu')}>
              <IconChevronDown size={16} />
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{t('action.fullPdf')}</Menu.Label>
            <Menu.Item
              component="a"
              {...opened(url({ full: true }))}
              target="_blank"
              rel="noopener"
              leftSection={<IconListDetails size={16} />}
            >
              {t('action.openFullPdf')}
            </Menu.Item>
            <Menu.Item
              component="a"
              {...saved(url({ full: true, download: true }))}
              leftSection={<IconDownload size={16} />}
            >
              {t('action.downloadFullPdf')}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </Button.Group>
  );
}
