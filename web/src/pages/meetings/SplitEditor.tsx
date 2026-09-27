import { Box, Button, Group, Modal, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useDeferredValue, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { Meeting } from '../../api/types';
import type { Section } from '../../components/minutes/context';
import { MinutesView } from '../../components/MinutesView';
import { focusKey, type MinutesViewFocus } from '../../lib/minutesDoc';
import { fromFormValues, withoutEmptyRows, type MinutesFormValues } from '../../lib/minutesForm';

/** The part of the email that shows the section open in the editor. */
function previewFocus(section: Section, values: MinutesFormValues): MinutesViewFocus | undefined {
  switch (section.kind) {
    case 'overview':
      return { section: 'summary' };
    case 'topic': {
      // A topic left empty is not in the email: count its place among the others.
      const index = withoutEmptyRows(values).topics.findIndex((topic) => topic.key === section.key);
      return index < 0 ? undefined : { topic: index };
    }
    case 'participants':
      return { section: 'attendees' };
    case 'decisions':
      return { section: 'topics' };
    case 'tasks':
      return { section: 'action_items' };
  }
}

/** The email as it will look, from the values being typed: deferred, so typing stays quick (the memoized view
 *  renders again only once React has time for it); scrolled to the part being edited when another one is. */
function LivePreview({ meeting, values, section }: { meeting: Meeting; values: MinutesFormValues; section: Section }) {
  const pane = useRef<HTMLDivElement>(null);
  const deferred = useDeferredValue(values);
  const minutes = useMemo(() => fromFormValues(deferred), [deferred]);
  const focus = useMemo(() => previewFocus(section, deferred), [section, deferred]);
  const key = focusKey(focus);

  useEffect(() => {
    // The pane scrolls on its own only side by side; stacked under the editor, scrolling would take the editor away.
    const element = pane.current?.closest<HTMLElement>('.split-editor-pane');
    const part = key ? pane.current?.querySelector<HTMLElement>(`[data-focus="${key}"]`) : null;
    if (!element || !part || getComputedStyle(element).overflowY !== 'auto') return;
    const top = part.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop - 16;
    element.scrollTo({ top, behavior: 'smooth' });
  }, [key]);

  return (
    <div ref={pane}>
      <MinutesView
        minutes={minutes}
        meetingType={meeting.meeting_type}
        language={meeting.minutes_language}
        meeting={meeting}
        focus={focus}
      />
    </div>
  );
}

interface SplitEditorProps {
  onClose: () => void;
  meeting: Meeting;
  values: MinutesFormValues;
  /** The section open in the editor: its part of the email is marked and scrolled to. */
  section: Section;
  /** The save status and buttons, as in the page's toolbar. */
  actions: ReactNode;
  /** The editor. */
  children: ReactNode;
}

/** Edit with live preview, on the whole screen: the editor on the left and, on the right, the email as it will be
 *  sent, updated while typing. */
export function SplitEditor({ onClose, meeting, values, section, actions, children }: SplitEditorProps) {
  const { t } = useTranslation('meetings');
  return (
    // Only Done closes it: Escape belongs to the dialogs and lists opened inside (the form stays, either way).
    <Modal.Root opened onClose={onClose} fullScreen closeOnEscape={false}>
      <Modal.Content className="split-editor">
        <Modal.Header className="split-editor-header">
          <Modal.Title fw={600}>{t('minutesEditor.split.title')}</Modal.Title>
          <Group gap="xs" justify="flex-end">
            {actions}
            <Button leftSection={<IconCheck size={16} />} onClick={onClose}>
              {t('minutesEditor.split.done')}
            </Button>
          </Group>
        </Modal.Header>
        <Box className="split-editor-body">
          <section className="split-editor-pane" aria-label={t('minutesEditor.split.editor')}>
            {children}
          </section>
          <section className="split-editor-pane split-editor-preview" aria-label={t('minutesEditor.split.preview')}>
            <Text size="xs" c="dimmed" ta="center" mb="sm">
              {t('minutesEditor.split.previewNote')}
            </Text>
            <LivePreview meeting={meeting} values={values} section={section} />
          </section>
        </Box>
      </Modal.Content>
    </Modal.Root>
  );
}
