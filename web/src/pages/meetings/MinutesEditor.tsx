import { Alert, Box, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useElementSize, useHotkeys } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCheck,
  IconDeviceFloppy,
  IconLayoutColumns,
  IconPencil,
  IconThumbUp,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useApproveMeeting, useSaveMinutes } from '../../api/queries';
import type { Meeting, Minutes } from '../../api/types';
import { useMinutesNav } from '../../components/minutes/context';
import { MinutesDocument } from '../../components/minutes/MinutesDocument';
import { useLeaveGuard } from '../../hooks/useLeaveGuard';
import { HEADER_HEIGHT } from '../../lib/layout';
import {
  fromFormValues,
  toFormValues,
  topicNameError,
  withoutEmptyRows,
  type MinutesFormValues,
} from '../../lib/minutesForm';
import { notifySuccess } from '../../lib/notify';
import { PdfButton } from '../../components/PdfButton';
import { EmailPreviewButton } from './EmailPreview';
import { SplitEditor } from './SplitEditor';

interface MinutesEditorProps {
  meeting: Meeting;
  minutes: Minutes;
  /** The minutes tab is the one shown (the tabs stay mounted): Ctrl/Cmd+S saves only then. */
  active: boolean;
  onApproved: () => void;
}

/** For the toolbar's height; one object, since a new one per render would observe (and render) again and again. */
const BORDER_BOX: ResizeObserverOptions = { box: 'border-box' };

/** What saving would store: equal payloads mean nothing to save (rows left empty, a row moved and back). */
const payload = (values: MinutesFormValues) => JSON.stringify(fromFormValues(values));

/** Draft minutes: read them, edit them in place or next to the email they make, save, then "I agree" to approve
 *  (they are frozen and can be sent). */
export function MinutesEditor({ meeting, minutes, active, onApproved }: MinutesEditorProps) {
  const { t } = useTranslation(['meetings', 'common']);
  const [initialValues] = useState(() => toFormValues(minutes));
  const [saved, setSaved] = useState(initialValues);
  const savedRef = useRef(initialValues); // for handlers that run after the render that created them
  const [editing, setEditing] = useState(false);
  const [split, setSplit] = useState(false); // editing next to the live email preview
  const splitButton = useRef<HTMLButtonElement>(null);
  const splitClosed = useRef(false);
  const [agreeing, setAgreeing] = useState(false);
  const nav = useMinutesNav();
  const { ref: toolbarRef, height: toolbarHeight } = useElementSize(BORDER_BOX);
  const save = useSaveMinutes(meeting.id);
  const approve = useApproveMeeting(meeting.id);
  const form = useForm<MinutesFormValues>({
    mode: 'controlled',
    initialValues,
    validate: {
      title: (value) => (value.trim() ? null : t('minutesEditor.titleRequired')),
      topics: { name: (_value, values, path) => topicNameError(values, Number(path.split('.')[1])) },
    },
  });
  const savedPayload = useMemo(() => payload(saved), [saved]);
  const dirty = payload(form.values) !== savedPayload;
  const guard = useLeaveGuard(dirty, t('minutesEditor.unsavedGuard'));
  const busy = save.isPending || approve.isPending || agreeing;

  const unsaved = () => payload(form.getValues()) !== payload(savedRef.current);

  const markSaved = (values: MinutesFormValues) => {
    savedRef.current = values;
    setSaved(values);
  };

  /** Saves; the form then shows what was stored (rows left empty are dropped) unless it changed meanwhile. */
  const saveValues = async (values: MinutesFormValues) => {
    await save.mutateAsync(fromFormValues(values));
    const stored = withoutEmptyRows(values);
    if (payload(form.getValues()) === payload(values)) form.setValues(stored);
    markSaved(stored);
  };

  /** False, with the first problem shown in edit mode, when the minutes can't be saved as they are. */
  const valid = () => {
    const { hasErrors, errors } = form.validate();
    if (!hasErrors) return true;
    setEditing(true);
    const topicPath = Object.keys(errors).find((path) => path.startsWith('topics.'));
    const topic = !errors.title && topicPath ? form.getValues().topics[Number(topicPath.split('.')[1])] : undefined;
    nav.setSection(topic ? { kind: 'topic', key: topic.key } : { kind: 'overview' });
    return false;
  };

  const handleSave = async () => {
    if (busy || !unsaved() || !valid()) return;
    try {
      await saveValues(form.getValues());
      notifySuccess(t('minutesEditor.saved'));
    } catch {
      // The error toast is shown by the query client.
    }
  };

  /** Before the email preview: unsaved changes are saved first, so the preview shows them; false if they can't be. */
  const savedForPreview = async () => {
    if (!unsaved()) return true;
    if (!valid()) return false;
    try {
      await saveValues(form.getValues());
      return true;
    } catch {
      return false; // the error toast is shown by the query client
    }
  };

  // By the key's place on the keyboard: on a Russian layout Ctrl+S types "ы".
  useHotkeys(
    [
      [
        'mod+S',
        () => {
          if (active) void handleSave();
        },
        { usePhysicalKeys: true },
      ],
    ],
    [],
  );

  // Keyboard focus goes back to "Edit with preview" once the split view is closed (its button was not on screen).
  useEffect(() => {
    if (split || !splitClosed.current) return;
    splitClosed.current = false;
    splitButton.current?.focus();
  }, [split]);

  const agree = async () => {
    setAgreeing(true); // the document is locked: nothing typed now could miss the approved version
    try {
      if (unsaved()) {
        if (!valid()) return;
        await saveValues(form.getValues());
      }
      await approve.mutateAsync();
      notifySuccess(t('minutesEditor.approvedNotice'));
      onApproved();
    } catch {
      // The error toast is shown by the query client.
    } finally {
      setAgreeing(false);
    }
  };

  const confirmAgree = () => {
    if (!valid()) return;
    const openWarnings = form.getValues().warnings.length;
    modals.openConfirmModal({
      title: t('minutesEditor.approveModal.title'),
      centered: true,
      children: (
        <Stack gap="sm">
          <Text size="sm">{t('minutesEditor.approveModal.body')}</Text>
          {dirty && <Text size="sm">{t('minutesEditor.approveModal.unsavedNotice')}</Text>}
          {openWarnings > 0 && (
            <Alert color="orange" icon={<IconAlertTriangle />}>
              {t('minutesEditor.approveModal.warnings', { count: openWarnings })}
            </Alert>
          )}
        </Stack>
      ),
      labels: { confirm: t('minutesEditor.agree'), cancel: t('common:action.cancel') },
      confirmProps: { leftSection: <IconThumbUp size={16} /> },
      onConfirm: () => void agree(),
    });
  };

  const confirmDiscard = () =>
    modals.openConfirmModal({
      title: t('minutesEditor.discardModal.title'),
      centered: true,
      children: <Text size="sm">{t('minutesEditor.discardModal.body')}</Text>,
      labels: { confirm: t('minutesEditor.discard'), cancel: t('minutesEditor.discardModal.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        form.setValues(savedRef.current);
        form.clearErrors();
        nav.setFocus(null);
      },
    });

  const status = (
    <Text size="sm" c={dirty ? 'orange.8' : 'dimmed'} role="status">
      {dirty ? t('minutesEditor.statusUnsaved') : t('minutesEditor.statusSaved')}
    </Text>
  );
  const saveButtons = (
    <>
      {dirty && (
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconArrowBackUp size={16} />}
          disabled={busy}
          onClick={confirmDiscard}
        >
          {t('minutesEditor.discard')}
        </Button>
      )}
      <Button
        variant="default"
        leftSection={<IconDeviceFloppy size={16} />}
        loading={save.isPending && !agreeing}
        disabled={busy || !dirty}
        onClick={() => void handleSave()}
        title={t('minutesEditor.saveTitle')}
      >
        {t('common:action.save')}
      </Button>
    </>
  );

  // On the whole screen, so the page behind is left out: the document is not drawn twice while typing.
  if (split) {
    return (
      <>
        <SplitEditor
          onClose={() => {
            splitClosed.current = true;
            setSplit(false);
          }}
          meeting={meeting}
          values={form.values}
          section={nav.section}
          actions={
            <>
              {status}
              {saveButtons}
            </>
          }
        >
          <MinutesDocument
            values={form.values}
            meetingType={meeting.meeting_type}
            form={form}
            transcriptOf={meeting.id}
            nav={nav}
            stickyTop={HEADER_HEIGHT}
            compactNav
          />
        </SplitEditor>
        {guard.modal}
      </>
    );
  }

  return (
    <Stack gap="md">
      <Box ref={toolbarRef} pos="sticky" top={HEADER_HEIGHT} style={{ zIndex: 5 }} className="no-print">
        <Paper withBorder shadow="xs" p="sm">
          <Group justify="space-between" gap="sm">
            {status}
            <Group gap="xs">
              <Button.Group>
                <Button
                  variant={editing ? 'light' : 'default'}
                  leftSection={editing ? <IconCheck size={16} /> : <IconPencil size={16} />}
                  disabled={agreeing}
                  onClick={() => {
                    setEditing(!editing);
                    nav.setFocus(null);
                  }}
                >
                  {editing ? t('minutesEditor.doneEditing') : t('common:action.edit')}
                </Button>
                <Button
                  ref={splitButton}
                  variant="default"
                  leftSection={<IconLayoutColumns size={16} />}
                  disabled={agreeing}
                  onClick={() => {
                    setSplit(true);
                    nav.setFocus(null);
                  }}
                >
                  {t('minutesEditor.split.open')}
                </Button>
              </Button.Group>
              {saveButtons}
              <EmailPreviewButton meetingId={meeting.id} beforeOpen={savedForPreview} disabled={busy} />
              <PdfButton meetingId={meeting.id} beforeOpen={savedForPreview} disabled={busy} full />
              <Button leftSection={<IconThumbUp size={16} />} onClick={confirmAgree} loading={agreeing} disabled={busy}>
                {t('minutesEditor.agree')}
              </Button>
            </Group>
          </Group>
        </Paper>
      </Box>

      <fieldset disabled={agreeing} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <MinutesDocument
          values={form.values}
          meetingType={meeting.meeting_type}
          form={editing ? form : undefined}
          transcriptOf={meeting.id}
          nav={nav}
          stickyTop={HEADER_HEIGHT + toolbarHeight + 8}
        />
      </fieldset>
      {guard.modal}
    </Stack>
  );
}
