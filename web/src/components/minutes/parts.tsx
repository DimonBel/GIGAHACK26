/** Small parts of the minutes document: headings, time links, and the rows of decisions and action items. */
import {
  ActionIcon,
  Anchor,
  Autocomplete,
  Box,
  Button,
  Flex,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconPlus, IconTrash, IconUserCheck } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { PRIORITIES } from '../../lib/meeting';
import { useDirectory } from '../../api/queries';
import { attendeeDetails, timeToSeconds, topicAt, topicRange } from '../../lib/minutesDoc';
import type { ActionRow, DecisionRow } from '../../lib/minutesForm';
import { PriorityBadge } from '../Badges';
import { useMinutesDocument } from './context';

const NO_TOPIC = 'none';
export const HAIRLINE = '1px solid var(--mantine-color-gray-2)';

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <Text component="h3" size="xs" fw={700} c="dimmed" tt="uppercase" lts={0.4} m={0}>
      {children}
    </Text>
  );
}

/** A part of a section, under a hairline. */
export function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Stack gap="xs" component="section" pt="md" style={{ borderTop: HAIRLINE }}>
      <SectionHeading>{title}</SectionHeading>
      {children}
      {note && (
        <Text size="xs" c="dimmed">
          {note}
        </Text>
      )}
    </Stack>
  );
}

/** "04:12": where it was said. Opens its topic (the given one, else the one discussed then) at that transcript
 *  line; plain text when there is nowhere to go. */
export function TimeLink({ time, topic }: { time: string; topic?: string }) {
  const { t } = useTranslation('minutes');
  const { values, transcriptOf, openTime } = useMinutesDocument();
  const seconds = timeToSeconds(time);
  if (!time.trim()) return null;
  const own = values.topics.findIndex((candidate) => candidate.key === topic);
  const clickable =
    seconds !== null &&
    (topic !== undefined
      ? transcriptOf !== null && topicRange(values.topics, own) !== null
      : topicAt(values.topics, seconds) >= 0);
  if (!clickable) return <span className="time-link time-link-plain">{time}</span>;
  const label = transcriptOf ? t('timeLink.openTranscript', { time }) : t('timeLink.openTopic', { time });
  return (
    <UnstyledButton className="time-link" onClick={() => openTime(time, topic)} title={label} aria-label={label}>
      {time}
    </UnstyledButton>
  );
}

/** The time column of a row: keeps the texts next to it aligned. */
function TimeCell({ time, topic }: { time: string; topic?: string }) {
  return (
    <Box w={52} style={{ flexShrink: 0 }}>
      <TimeLink time={time} topic={topic} />
    </Box>
  );
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <ActionIcon variant="subtle" color="gray" aria-label={label} title={label} onClick={onClick} mt={4}>
      <IconTrash size={16} />
    </ActionIcon>
  );
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="subtle" size="xs" leftSection={<IconPlus size={14} />} onClick={onClick} w="fit-content">
      {label}
    </Button>
  );
}

/** Edit mode: moves a decision or an action item (the form row at `row`) to another topic, or to none. */
function TopicSelect({ row, value, label, size }: { row: string; value: string; label: string; size?: 'xs' }) {
  const { t } = useTranslation('minutes');
  const { values, form } = useMinutesDocument();
  if (!form) return null;
  const data = [
    { value: NO_TOPIC, label: t('topic.noTopicOption') },
    ...values.topics.map((topic, index) => ({
      value: topic.key,
      label: t('topic.optionLabel', { index: index + 1, name: topic.name.trim() || t('topic.untitledOption') }),
    })),
  ];
  return (
    <Select
      size={size}
      data={data}
      value={value || NO_TOPIC}
      allowDeselect={false}
      aria-label={label}
      onChange={(next) => {
        form.setFieldValue(`${row}.topic`, next && next !== NO_TOPIC ? next : '');
        // Saved rows of a topic take its name; a row moved to none must not keep the old one.
        form.setFieldValue(`${row}.patient`, '');
      }}
    />
  );
}

/** Decisions to read; with the topic named where decisions of several topics are listed. */
export function DecisionList({ rows, withTopic = false }: { rows: DecisionRow[]; withTopic?: boolean }) {
  return (
    <Stack gap={8}>
      {rows.map((row, index) => (
        <Group key={index} gap="sm" wrap="nowrap" align="flex-start">
          <TimeCell time={row.time} topic={row.topic || undefined} />
          <Text size="sm" style={{ flex: 1 }}>
            {row.decision}
            {withTopic && row.patient && (
              <Text span size="sm" c="dimmed">
                {' '}
                — {row.patient}
              </Text>
            )}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

/** Edit mode: the decisions that pass `which`; new ones go to the topic `newTopic`. */
export function DecisionEditRows({ which, newTopic }: { which: (row: DecisionRow) => boolean; newTopic: string }) {
  const { t } = useTranslation('minutes');
  const { values, form } = useMinutesDocument();
  if (!form) return null;
  const rows = values.decisions.map((row, index) => ({ row, index })).filter(({ row }) => which(row));
  return (
    <Stack gap="xs">
      {rows.map(({ row, index }, position) => {
        const n = position + 1;
        return (
          <Flex key={index} gap="xs" direction={{ base: 'column', sm: 'row' }} align={{ sm: 'flex-start' }}>
            <Group gap="xs" wrap="nowrap" align="flex-start" style={{ flex: 1 }}>
              <TextInput
                w={76}
                placeholder={t('field.timePlaceholder')}
                aria-label={t('decisionRow.timeAria', { index: n })}
                {...form.getInputProps(`decisions.${index}.time`)}
              />
              <Textarea
                autosize
                minRows={1}
                style={{ flex: 1 }}
                aria-label={t('decisionRow.textAria', { index: n })}
                {...form.getInputProps(`decisions.${index}.decision`)}
              />
            </Group>
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <Box w={{ base: '100%', sm: 170 }} style={{ flex: 1 }}>
                <TopicSelect
                  row={`decisions.${index}`}
                  value={row.topic}
                  label={t('decisionRow.topicAria', { index: n })}
                />
              </Box>
              <RemoveButton
                label={t('decisionRow.removeAria', { index: n })}
                onClick={() => form.removeListItem('decisions', index)}
              />
            </Group>
          </Flex>
        );
      })}
      <AddButton
        label={t('decisionRow.add')}
        onClick={() => form.insertListItem('decisions', { decision: '', time: '', patient: '', topic: newTopic })}
      />
    </Stack>
  );
}

/** Action items to read: task, owner and deadline, priority; with a link to the topic where items of several
 *  topics are listed. */
export function TaskList({ rows, withTopic = false }: { rows: ActionRow[]; withTopic?: boolean }) {
  const { t } = useTranslation('minutes');
  const { values, select } = useMinutesDocument();
  return (
    <Stack gap={0}>
      {rows.map((row, index) => {
        const topic = values.topics.find((candidate) => candidate.key === row.topic);
        return (
          <Group
            key={index}
            justify="space-between"
            wrap="nowrap"
            align="flex-start"
            py="xs"
            style={index ? { borderTop: HAIRLINE } : undefined}
          >
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={500}>
                {row.task}
              </Text>
              <Text size="xs" c="dimmed">
                {[row.owner || t('field.noOwner'), row.deadline].filter(Boolean).join(' · ')}
              </Text>
              {withTopic && topic && (
                <Anchor
                  component="button"
                  type="button"
                  size="xs"
                  ta="left"
                  onClick={() => select({ kind: 'topic', key: topic.key })}
                >
                  {topic.name.trim() || t('topic.untitledOption')}
                </Anchor>
              )}
              {withTopic && !topic && row.patient && (
                <Text size="xs" c="dimmed">
                  {row.patient}
                </Text>
              )}
            </Stack>
            <Group gap={6} wrap="nowrap">
              <PriorityBadge priority={row.priority} />
              <TimeLink time={row.time} topic={row.topic || undefined} />
            </Group>
          </Group>
        );
      })}
    </Stack>
  );
}

const sameName = (name: string) => name.trim().toLowerCase();

/** Edit mode: an action item's owner, typed or picked from the attendees, the named voices and the app's users;
 *  picking a user of the app assigns the item to them (owner_user_id), typing another name does not. */
function OwnerInput({ row, index, label }: { row: ActionRow; index: number; label: string }) {
  const { t } = useTranslation('minutes');
  const { values, form } = useMinutesDocument();
  const directory = useDirectory(form !== null);
  if (!form) return null;
  const people = directory.data ?? [];
  const byName = new Map(people.map((person) => [sameName(person.full_name), person]));
  const names = [
    ...new Set(
      [
        ...values.attendees.map((attendee) => attendee.name),
        ...values.participants.map((participant) => participant.name),
        ...people.map((person) => person.full_name),
      ]
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
  const assigned = row.owner_user_id != null ? people.find((person) => person.id === row.owner_user_id) : undefined;
  return (
    <Autocomplete
      size="xs"
      data={names}
      value={row.owner}
      placeholder={t('field.ownerPlaceholder')}
      aria-label={label}
      leftSection={
        assigned && (
          <Tooltip label={t('actionItemRow.assigned', { name: assigned.full_name })} withinPortal>
            <IconUserCheck size={14} color="var(--mantine-color-teal-6)" />
          </Tooltip>
        )
      }
      renderOption={({ option }) => {
        const person = byName.get(sameName(option.value));
        const details = person ? attendeeDetails(person) : '';
        return (
          <Stack gap={0}>
            <Text size="xs">{option.value}</Text>
            {details && (
              <Text size="xs" c="dimmed">
                {details}
              </Text>
            )}
          </Stack>
        );
      }}
      onChange={(owner) => {
        form.setFieldValue(`action_items.${index}.owner`, owner);
        form.setFieldValue(`action_items.${index}.owner_user_id`, byName.get(sameName(owner))?.id ?? null);
      }}
    />
  );
}

/** Edit mode: the action items that pass `which`; new ones go to the topic `newTopic`. */
export function TaskEditRows({ which, newTopic }: { which: (row: ActionRow) => boolean; newTopic: string }) {
  const { t } = useTranslation('minutes');
  const { values, form } = useMinutesDocument();
  if (!form) return null;
  const rows = values.action_items.map((row, index) => ({ row, index })).filter(({ row }) => which(row));
  const priorityOptions = PRIORITIES.map((priority) => ({
    value: priority,
    label: t(`field.priorityOption.${priority}`),
  }));
  return (
    <Stack gap="xs">
      {rows.map(({ row, index }, position) => {
        const n = position + 1;
        const path = (field: string) => `action_items.${index}.${field}`;
        return (
          <Paper key={index} withBorder p="xs">
            <Stack gap={6}>
              <Group gap="xs" wrap="nowrap" align="flex-start">
                <Textarea
                  autosize
                  minRows={1}
                  style={{ flex: 1 }}
                  placeholder={t('field.taskPlaceholder')}
                  aria-label={t('actionItemRow.taskAria', { index: n })}
                  {...form.getInputProps(path('task'))}
                />
                <RemoveButton
                  label={t('actionItemRow.removeAria', { index: n })}
                  onClick={() => form.removeListItem('action_items', index)}
                />
              </Group>
              <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="xs" verticalSpacing="xs">
                <OwnerInput row={row} index={index} label={t('actionItemRow.ownerAria', { index: n })} />
                <TextInput
                  size="xs"
                  placeholder={t('field.deadlinePlaceholder')}
                  aria-label={t('actionItemRow.deadlineAria', { index: n })}
                  {...form.getInputProps(path('deadline'))}
                />
                <Select
                  size="xs"
                  data={priorityOptions}
                  allowDeselect={false}
                  aria-label={t('actionItemRow.priorityAria', { index: n })}
                  {...form.getInputProps(path('priority'))}
                />
                <TextInput
                  size="xs"
                  placeholder={t('field.timePlaceholder')}
                  aria-label={t('actionItemRow.timeAria', { index: n })}
                  {...form.getInputProps(path('time'))}
                />
                <TopicSelect
                  size="xs"
                  row={`action_items.${index}`}
                  value={row.topic}
                  label={t('actionItemRow.topicAria', { index: n })}
                />
              </SimpleGrid>
            </Stack>
          </Paper>
        );
      })}
      <AddButton
        label={t('actionItemRow.add')}
        onClick={() =>
          form.insertListItem('action_items', {
            task: '',
            owner: '',
            deadline: '',
            priority: 'medium',
            time: '',
            patient: '',
            topic: newTopic,
          })
        }
      />
    </Stack>
  );
}

/** Edit mode: a list of free-text lines (findings, open issues). The caller translates: it knows which. */
export function TextLinesEdit({
  path,
  items,
  itemAriaLabel,
  removeLabel,
  addLabel,
}: {
  path: string;
  items: string[];
  itemAriaLabel: (index: number) => string;
  removeLabel: (index: number) => string;
  addLabel: string;
}) {
  const { form } = useMinutesDocument();
  if (!form) return null;
  return (
    <Stack gap="xs">
      {items.map((_, index) => (
        <Group key={index} gap="xs" wrap="nowrap" align="flex-start">
          <Textarea
            autosize
            minRows={1}
            style={{ flex: 1 }}
            aria-label={itemAriaLabel(index + 1)}
            {...form.getInputProps(`${path}.${index}`)}
          />
          <RemoveButton label={removeLabel(index + 1)} onClick={() => form.removeListItem(path, index)} />
        </Group>
      ))}
      <AddButton label={addLabel} onClick={() => form.insertListItem(path, '')} />
    </Stack>
  );
}
