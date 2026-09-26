/** The sections of the minutes editor: one component per part of the minutes. */
import {
  ActionIcon,
  Alert,
  Autocomplete,
  Button,
  Group,
  List,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { IconAlertTriangle, IconCheck, IconPlus, IconTrash } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import type { MeetingType } from '../../api/types';
import { formatDuration } from '../../lib/format';
import { PRIORITIES, topicLabel, topicsLabel } from '../../lib/meeting';
import type { MinutesFormValues } from '../../lib/minutesForm';

export type MinutesForm = UseFormReturnType<MinutesFormValues>;

/** Adds and removes list rows. Inputs are uncontrolled (a long meeting has hundreds), so every row is
 *  re-mounted after a change: a removed row's input must not keep showing its old text in the next row. */
export interface ListControls {
  version: number;
  add: (path: string, item: unknown) => void;
  remove: (path: string, index: number) => void;
}

interface FieldsProps {
  form: MinutesForm;
  lists: ListControls;
}

interface TableFieldProps extends FieldsProps {
  topicNames: string[];
  meetingType: MeetingType;
}

const PRIORITY_OPTIONS = PRIORITIES.map((priority) => ({ value: priority, label: priority }));

interface SectionCardProps {
  title: string;
  description?: string;
  addLabel?: string;
  onAdd?: () => void;
  children: ReactNode;
}

function SectionCard({ title, description, addLabel, onAdd, children }: SectionCardProps) {
  return (
    <Paper withBorder p="lg" component="section">
      <Stack gap="sm">
        <div>
          <Title order={4}>{title}</Title>
          {description && (
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          )}
        </div>
        {children}
        {onAdd && (
          <Button variant="subtle" size="xs" leftSection={<IconPlus size={14} />} onClick={onAdd} w="fit-content">
            {addLabel}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <ActionIcon variant="subtle" color="gray" aria-label={label} title={label} onClick={onClick}>
      <IconTrash size={16} />
    </ActionIcon>
  );
}

/** A list of free-text lines (findings, open issues, suggestions). */
function TextLines({
  form,
  lists,
  path,
  items,
  itemLabel,
}: FieldsProps & { path: string; items: string[]; itemLabel: string }) {
  return (
    <Stack gap="xs">
      {items.map((_, index) => (
        <Group key={`${lists.version}:${index}`} gap="xs" wrap="nowrap" align="flex-start">
          <Textarea
            autosize
            minRows={1}
            style={{ flex: 1 }}
            aria-label={`${itemLabel} ${index + 1}`}
            key={form.key(`${path}.${index}`)}
            {...form.getInputProps(`${path}.${index}`)}
          />
          <RemoveButton
            label={`Remove ${itemLabel.toLowerCase()} ${index + 1}`}
            onClick={() => lists.remove(path, index)}
          />
        </Group>
      ))}
    </Stack>
  );
}

export function WarningsField({ form, lists }: FieldsProps) {
  const warnings = form.getValues().warnings;
  if (warnings.length === 0) return null;
  return (
    <Alert
      color="orange"
      variant="light"
      icon={<IconAlertTriangle />}
      title={`Check before approving (${warnings.length})`}
    >
      <Text size="sm" mb="xs">
        The automatic check did not find these values in the transcript. Compare them with the recording, correct the
        minutes, then mark each one as checked.
      </Text>
      <List size="sm" spacing={6} listStyleType="none">
        {warnings.map((warning, index) => (
          <List.Item key={`${lists.version}:${index}`}>
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <Button
                size="compact-xs"
                variant="white"
                color="orange"
                leftSection={<IconCheck size={12} />}
                onClick={() => lists.remove('warnings', index)}
              >
                Checked
              </Button>
              <Text size="sm">{warning}</Text>
            </Group>
          </List.Item>
        ))}
      </List>
    </Alert>
  );
}

export function ParticipantsField({ form }: { form: MinutesForm }) {
  const participants = form.getValues().participants;
  if (participants.length === 0) return null;
  return (
    <SectionCard title="Participants" description="Roles are guessed by the local AI. Correct them and add names.">
      <Table.ScrollContainer minWidth={560}>
        <Table verticalSpacing={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Speaker</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Talk time</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {participants.map((participant, index) => (
              <Table.Tr key={participant.speaker}>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>{participant.speaker}</Table.Td>
                <Table.Td>
                  <TextInput
                    aria-label={`Role of ${participant.speaker}`}
                    key={form.key(`participants.${index}.role`)}
                    {...form.getInputProps(`participants.${index}.role`)}
                  />
                </Table.Td>
                <Table.Td>
                  <TextInput
                    aria-label={`Name of ${participant.speaker}`}
                    key={form.key(`participants.${index}.name`)}
                    {...form.getInputProps(`participants.${index}.name`)}
                  />
                </Table.Td>
                <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDuration(participant.seconds)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </SectionCard>
  );
}

export function KeyMomentsField({ form, lists }: FieldsProps) {
  return (
    <SectionCard
      title="Key moments"
      addLabel="Add key moment"
      onAdd={() => lists.add('key_moments', { time: '', moment: '' })}
    >
      {form.getValues().key_moments.map((_, index) => (
        <Group key={`${lists.version}:${index}`} gap="xs" wrap="nowrap" align="flex-start">
          <TextInput
            w={90}
            placeholder="mm:ss"
            aria-label={`Key moment ${index + 1} time`}
            key={form.key(`key_moments.${index}.time`)}
            {...form.getInputProps(`key_moments.${index}.time`)}
          />
          <Textarea
            autosize
            minRows={1}
            style={{ flex: 1 }}
            aria-label={`Key moment ${index + 1}`}
            key={form.key(`key_moments.${index}.moment`)}
            {...form.getInputProps(`key_moments.${index}.moment`)}
          />
          <RemoveButton label={`Remove key moment ${index + 1}`} onClick={() => lists.remove('key_moments', index)} />
        </Group>
      ))}
    </SectionCard>
  );
}

export function TopicsField({ form, lists, meetingType }: FieldsProps & { meetingType: MeetingType }) {
  const label = topicLabel(meetingType);
  return (
    <SectionCard
      title={topicsLabel(meetingType)}
      addLabel={`Add ${label.toLowerCase()}`}
      onAdd={() => lists.add('topics', { name: '', time: '', status: '', findings: [] })}
    >
      {form.getValues().topics.map((topic, index) => (
        <Paper key={`${lists.version}:${index}`} withBorder p="md" bg="gray.0">
          <Stack gap="xs">
            <Group gap="xs" wrap="nowrap" align="flex-end">
              <TextInput
                label={label}
                style={{ flex: 1 }}
                key={form.key(`topics.${index}.name`)}
                {...form.getInputProps(`topics.${index}.name`)}
              />
              <TextInput
                label="Time"
                w={90}
                placeholder="mm:ss"
                key={form.key(`topics.${index}.time`)}
                {...form.getInputProps(`topics.${index}.time`)}
              />
              <RemoveButton
                label={`Remove ${label.toLowerCase()} ${index + 1}`}
                onClick={() => lists.remove('topics', index)}
              />
            </Group>
            <Textarea
              label="Status"
              autosize
              minRows={2}
              key={form.key(`topics.${index}.status`)}
              {...form.getInputProps(`topics.${index}.status`)}
            />
            <Text size="sm" fw={500}>
              Findings
            </Text>
            <TextLines
              form={form}
              lists={lists}
              path={`topics.${index}.findings`}
              items={topic.findings}
              itemLabel="Finding"
            />
            <Button
              variant="subtle"
              size="compact-xs"
              leftSection={<IconPlus size={12} />}
              w="fit-content"
              onClick={() => lists.add(`topics.${index}.findings`, '')}
            >
              Add finding
            </Button>
          </Stack>
        </Paper>
      ))}
    </SectionCard>
  );
}

export function DecisionsField({ form, lists, topicNames, meetingType }: TableFieldProps) {
  const decisions = form.getValues().decisions;
  const input = (index: number, field: string) => `decisions.${index}.${field}`;
  return (
    <SectionCard
      title="Decisions"
      addLabel="Add decision"
      onAdd={() => lists.add('decisions', { decision: '', time: '', patient: '' })}
    >
      {decisions.length > 0 && (
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing={6} horizontalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={80}>Time</Table.Th>
                <Table.Th>Decision</Table.Th>
                <Table.Th w={180}>{topicLabel(meetingType)}</Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {decisions.map((_, index) => {
                const row = `decision ${index + 1}`;
                return (
                  <Table.Tr key={`${lists.version}:${index}`}>
                    <Table.Td>
                      <TextInput
                        placeholder="mm:ss"
                        aria-label={`Time of ${row}`}
                        key={form.key(input(index, 'time'))}
                        {...form.getInputProps(input(index, 'time'))}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Textarea
                        autosize
                        minRows={1}
                        aria-label={`Text of ${row}`}
                        key={form.key(input(index, 'decision'))}
                        {...form.getInputProps(input(index, 'decision'))}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Autocomplete
                        data={topicNames}
                        aria-label={`${topicLabel(meetingType)} of ${row}`}
                        key={form.key(input(index, 'patient'))}
                        {...form.getInputProps(input(index, 'patient'))}
                      />
                    </Table.Td>
                    <Table.Td>
                      <RemoveButton label={`Remove ${row}`} onClick={() => lists.remove('decisions', index)} />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </SectionCard>
  );
}

export function ActionItemsField({ form, lists, topicNames, meetingType }: TableFieldProps) {
  const items = form.getValues().action_items;
  const input = (index: number, field: string) => `action_items.${index}.${field}`;
  return (
    <SectionCard
      title="Action items"
      addLabel="Add action item"
      onAdd={() =>
        lists.add('action_items', { task: '', owner: '', deadline: '', priority: 'medium', time: '', patient: '' })
      }
    >
      {items.length > 0 && (
        <Table.ScrollContainer minWidth={860}>
          <Table verticalSpacing={6} horizontalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Task</Table.Th>
                <Table.Th w={150}>Owner</Table.Th>
                <Table.Th w={120}>Deadline</Table.Th>
                <Table.Th w={110}>Priority</Table.Th>
                <Table.Th w={140}>{topicLabel(meetingType)}</Table.Th>
                <Table.Th w={76}>Time</Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((_, index) => {
                const row = `action item ${index + 1}`;
                return (
                  <Table.Tr key={`${lists.version}:${index}`}>
                    <Table.Td>
                      <Textarea
                        autosize
                        minRows={1}
                        aria-label={`Task of ${row}`}
                        key={form.key(input(index, 'task'))}
                        {...form.getInputProps(input(index, 'task'))}
                      />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        aria-label={`Owner of ${row}`}
                        key={form.key(input(index, 'owner'))}
                        {...form.getInputProps(input(index, 'owner'))}
                      />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        aria-label={`Deadline of ${row}`}
                        key={form.key(input(index, 'deadline'))}
                        {...form.getInputProps(input(index, 'deadline'))}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Select
                        data={PRIORITY_OPTIONS}
                        allowDeselect={false}
                        aria-label={`Priority of ${row}`}
                        key={form.key(input(index, 'priority'))}
                        {...form.getInputProps(input(index, 'priority'))}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Autocomplete
                        data={topicNames}
                        aria-label={`${topicLabel(meetingType)} of ${row}`}
                        key={form.key(input(index, 'patient'))}
                        {...form.getInputProps(input(index, 'patient'))}
                      />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        placeholder="mm:ss"
                        aria-label={`Time of ${row}`}
                        key={form.key(input(index, 'time'))}
                        {...form.getInputProps(input(index, 'time'))}
                      />
                    </Table.Td>
                    <Table.Td>
                      <RemoveButton label={`Remove ${row}`} onClick={() => lists.remove('action_items', index)} />
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </SectionCard>
  );
}

/** A section of free-text lines at the top level of the minutes (open issues, suggestions). */
export function TextLinesField({
  form,
  lists,
  path,
  title,
  description,
  itemLabel,
}: FieldsProps & { path: 'open_issues' | 'suggestions'; title: string; description?: string; itemLabel: string }) {
  return (
    <SectionCard
      title={title}
      description={description}
      addLabel={`Add ${itemLabel.toLowerCase()}`}
      onAdd={() => lists.add(path, '')}
    >
      <TextLines form={form} lists={lists} path={path} items={form.getValues()[path]} itemLabel={itemLabel} />
    </SectionCard>
  );
}
