import { Alert, Button, Group, Paper, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { IconAlertTriangle, IconDeviceFloppy, IconThumbUp } from '@tabler/icons-react';
import { useState } from 'react';

import { useApproveMeeting, useSaveMinutes } from '../../api/queries';
import type { Meeting, Minutes } from '../../api/types';
import { useLeaveGuard } from '../../hooks/useLeaveGuard';
import { HEADER_HEIGHT } from '../../lib/layout';
import { fromFormValues, toFormValues, type MinutesFormValues } from '../../lib/minutesForm';
import { notifySuccess } from '../../lib/notify';
import {
  ActionItemsField,
  DecisionsField,
  KeyMomentsField,
  ParticipantsField,
  TextLinesField,
  TopicsField,
  WarningsField,
  type ListControls,
} from './MinutesFields';

interface MinutesEditorProps {
  meeting: Meeting;
  minutes: Minutes;
  onApproved: () => void;
}

/** Editable draft minutes: save, then "I agree" to approve (the minutes are frozen and can be sent). */
export function MinutesEditor({ meeting, minutes, onApproved }: MinutesEditorProps) {
  const [dirty, setDirty] = useState(false);
  const [version, setVersion] = useState(0);
  const [initialValues] = useState(() => toFormValues(minutes));
  const save = useSaveMinutes(meeting.id);
  const approve = useApproveMeeting(meeting.id);
  const form = useForm<MinutesFormValues>({
    mode: 'uncontrolled',
    initialValues,
    validate: { title: (value) => (value.trim() ? null : 'The minutes need a title') },
    onValuesChange: () => setDirty(true),
  });
  const guard = useLeaveGuard(dirty, 'Your changes to the minutes are not saved.');

  const lists: ListControls = {
    version,
    add: (path, item) => {
      form.insertListItem(path, item);
      setVersion((current) => current + 1);
    },
    remove: (path, index) => {
      form.removeListItem(path, index);
      setVersion((current) => current + 1);
    },
  };

  /** Saves and shows what was stored (rows left empty are dropped). */
  const saveValues = async (values: MinutesFormValues) => {
    const stored = toFormValues(await save.mutateAsync(fromFormValues(values)));
    form.setInitialValues(stored);
    form.setValues(stored);
    setDirty(false);
  };

  const handleSave = form.onSubmit(async (values) => {
    try {
      await saveValues(values);
      notifySuccess('Minutes saved.');
    } catch {
      // The error toast is shown by the query client.
    }
  });

  const agree = async () => {
    try {
      if (dirty) await saveValues(form.getValues());
      await approve.mutateAsync();
      notifySuccess('Minutes approved. Choose the recipients and send them.');
      onApproved();
    } catch {
      // The error toast is shown by the query client.
    }
  };

  const confirmAgree = () => {
    if (form.validate().hasErrors) return;
    const openWarnings = form.getValues().warnings.length;
    modals.openConfirmModal({
      title: 'Approve the minutes?',
      centered: true,
      children: (
        <Stack gap="sm">
          <Text size="sm">
            By clicking “I agree” you confirm that these minutes are correct. They become read-only and can be sent to
            the recipients. You can reopen them until they are sent.
          </Text>
          {dirty && <Text size="sm">Your unsaved changes are saved first.</Text>}
          {openWarnings > 0 && (
            <Alert color="orange" icon={<IconAlertTriangle />}>
              {openWarnings} value(s) flagged by the automatic check are not marked as checked.
            </Alert>
          )}
        </Stack>
      ),
      labels: { confirm: 'I agree', cancel: 'Cancel' },
      confirmProps: { leftSection: <IconThumbUp size={16} /> },
      onConfirm: () => void agree(),
    });
  };

  const topicNames = [
    ...new Set(
      form
        .getValues()
        .topics.map((topic) => topic.name.trim())
        .filter(Boolean),
    ),
  ];
  const busy = save.isPending || approve.isPending;

  return (
    <form onSubmit={handleSave} noValidate>
      <Stack gap="lg">
        <Paper
          withBorder
          shadow="xs"
          p="sm"
          pos="sticky"
          top={HEADER_HEIGHT}
          style={{ zIndex: 5 }}
          className="no-print"
        >
          <Group justify="space-between" gap="sm">
            <Text size="sm" c={dirty ? 'orange.8' : 'dimmed'} role="status">
              {dirty ? 'Unsaved changes' : 'Draft minutes · all changes saved'}
            </Text>
            <Group gap="xs">
              <Button
                type="submit"
                variant="default"
                leftSection={<IconDeviceFloppy size={16} />}
                loading={save.isPending}
                disabled={busy || !dirty}
              >
                Save
              </Button>
              <Button
                leftSection={<IconThumbUp size={16} />}
                onClick={confirmAgree}
                loading={approve.isPending}
                disabled={busy}
              >
                I agree
              </Button>
            </Group>
          </Group>
        </Paper>

        <WarningsField form={form} lists={lists} />

        <Paper withBorder p="lg">
          <Stack gap="sm">
            <TextInput label="Title" required key={form.key('title')} {...form.getInputProps('title')} />
            <Textarea
              label="Summary"
              autosize
              minRows={3}
              key={form.key('summary')}
              {...form.getInputProps('summary')}
            />
          </Stack>
        </Paper>

        <ParticipantsField form={form} />
        <KeyMomentsField form={form} lists={lists} />
        <TopicsField form={form} lists={lists} meetingType={meeting.meeting_type} />
        <DecisionsField form={form} lists={lists} topicNames={topicNames} meetingType={meeting.meeting_type} />
        <ActionItemsField form={form} lists={lists} topicNames={topicNames} meetingType={meeting.meeting_type} />

        <TextLinesField form={form} lists={lists} path="open_issues" title="Open issues" itemLabel="Open issue" />
        <TextLinesField
          form={form}
          lists={lists}
          path="suggestions"
          title="AI suggestions"
          description="Follow-ups proposed by the local AI; not decided in the meeting."
          itemLabel="Suggestion"
        />
      </Stack>
      {guard.modal}
    </form>
  );
}
