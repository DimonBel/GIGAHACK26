import {
  ActionIcon,
  Button,
  Group,
  List,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconChevronLeft, IconChevronRight, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { priorityRank } from '../../lib/minutesDoc';
import { useMinutesDocument, type MinutesForm } from './context';
import { Block, DecisionEditRows, DecisionList, TaskEditRows, TaskList, TextLinesEdit, TimeLink } from './parts';
import { TopicTranscript } from './TopicTranscript';

/** "Patient 2 of 4 · from 03:52", with the previous and next ones. */
function TopicPosition({ index }: { index: number }) {
  const { t } = useTranslation('minutes');
  const { values, select, form } = useMinutesDocument();
  const topics = values.topics;
  const go = (to: number) => select({ kind: 'topic', key: topics[to].key });
  return (
    <Group justify="space-between" gap="xs" wrap="nowrap">
      <Group gap={6} wrap="nowrap">
        <Text size="sm" c="dimmed">
          {t('topic.position', { current: index + 1, total: topics.length })}
        </Text>
        {!form && topics[index].time && (
          <>
            <Text size="sm" c="dimmed">
              {t('topic.from')}
            </Text>
            <TimeLink time={topics[index].time} topic={topics[index].key} />
          </>
        )}
      </Group>
      <Group gap={4} wrap="nowrap" className="no-print">
        <ActionIcon
          variant="default"
          aria-label={t('topic.previous')}
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          <IconChevronLeft size={16} />
        </ActionIcon>
        <ActionIcon
          variant="default"
          aria-label={t('topic.next')}
          disabled={index === topics.length - 1}
          onClick={() => go(index + 1)}
        >
          <IconChevronRight size={16} />
        </ActionIcon>
      </Group>
    </Group>
  );
}

function TopicEditor({ index, form }: { index: number; form: MinutesForm }) {
  const { t } = useTranslation(['minutes', 'common']);
  const { values, meetingType, select } = useMinutesDocument();
  const topic = values.topics[index];

  const confirmDelete = () => {
    const decisions = values.decisions.filter((row) => row.topic === topic.key).length;
    const tasks = values.action_items.filter((row) => row.topic === topic.key).length;
    modals.openConfirmModal({
      title: t('topic.deleteTitle', { name: topic.name.trim() || t('topic.thisTopic') }),
      centered: true,
      children: (
        <Text size="sm">
          {t('topic.deleteBody', {
            decisions: t('topic.decisionsCount', { count: decisions }),
            tasks: t('topic.actionItemsCount', { count: tasks }),
          })}
        </Text>
      ),
      labels: { confirm: t('action.delete', { ns: 'common' }), cancel: t('action.cancel', { ns: 'common' }) },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        const current = form.getValues();
        form.setValues({
          topics: current.topics.filter((row) => row.key !== topic.key),
          decisions: current.decisions.filter((row) => row.topic !== topic.key),
          action_items: current.action_items.filter((row) => row.topic !== topic.key),
        });
        select({ kind: 'overview' });
      },
    });
  };

  return (
    <Stack gap="lg">
      <VisuallyHidden>
        <h2>{topic.name.trim() || t('topic.newTopic')}</h2>
      </VisuallyHidden>
      <Stack gap="sm">
        <TopicPosition index={index} />
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <TextInput
            label={t('labels.topic')}
            size="md"
            autoFocus={!topic.name}
            placeholder={
              meetingType === 'medical' ? t('topic.namePlaceholderMedical') : t('topic.namePlaceholderGeneral')
            }
            style={{ flex: 1 }}
            {...form.getInputProps(`topics.${index}.name`)}
          />
          <TextInput
            label={t('labels.time')}
            size="md"
            w={96}
            placeholder={t('field.timePlaceholder')}
            {...form.getInputProps(`topics.${index}.time`)}
          />
        </Group>
        <Textarea label={t('labels.status')} autosize minRows={2} {...form.getInputProps(`topics.${index}.status`)} />
      </Stack>
      <Block title={t('labels.findings')}>
        <TextLinesEdit
          path={`topics.${index}.findings`}
          items={topic.findings}
          itemAriaLabel={(n) => t('topic.findingAria', { index: n })}
          removeLabel={(n) => t('topic.removeFinding', { index: n })}
          addLabel={t('topic.addFinding')}
        />
      </Block>
      <Block title={t('labels.decisions')}>
        <DecisionEditRows which={(row) => row.topic === topic.key} newTopic={topic.key} />
      </Block>
      <Block title={t('labels.actionItems')}>
        <TaskEditRows which={(row) => row.topic === topic.key} newTopic={topic.key} />
      </Block>
      <TopicTranscript index={index} />
      <Button
        variant="subtle"
        color="red"
        size="xs"
        w="fit-content"
        leftSection={<IconTrash size={14} />}
        onClick={confirmDelete}
      >
        {t('topic.deleteButton')}
      </Button>
    </Stack>
  );
}

/** One topic (a patient, an agenda item): status, findings, decisions, action items and what was said about it. */
export function TopicSection({ index }: { index: number }) {
  const { t } = useTranslation('minutes');
  const { values, form } = useMinutesDocument();
  if (form) return <TopicEditor index={index} form={form} />;

  const topic = values.topics[index];
  const decisions = values.decisions.filter((row) => row.topic === topic.key);
  const tasks = values.action_items
    .filter((row) => row.topic === topic.key)
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  const empty = !topic.status.trim() && !topic.findings.length && !decisions.length && !tasks.length;

  return (
    <Stack gap="lg">
      <Stack gap={6}>
        <TopicPosition index={index} />
        <Title order={2}>{topic.name.trim() || t('topic.untitled')}</Title>
      </Stack>
      {topic.status.trim() && (
        <Text size="lg" maw="70ch" style={{ whiteSpace: 'pre-wrap' }}>
          {topic.status}
        </Text>
      )}
      {topic.findings.length > 0 && (
        <Block title={t('labels.findings')}>
          <List size="sm" spacing={4}>
            {topic.findings.map((finding, findingIndex) => (
              <List.Item key={findingIndex}>{finding}</List.Item>
            ))}
          </List>
        </Block>
      )}
      {decisions.length > 0 && (
        <Block title={t('labels.decisions')}>
          <DecisionList rows={decisions} />
        </Block>
      )}
      {tasks.length > 0 && (
        <Block title={t('labels.actionItems')}>
          <TaskList rows={tasks} />
        </Block>
      )}
      {empty && (
        <Text size="sm" c="dimmed">
          {t('topic.nothingRecorded')}
        </Text>
      )}
      <TopicTranscript index={index} />
    </Stack>
  );
}
