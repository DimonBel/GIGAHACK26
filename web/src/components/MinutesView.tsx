import { Alert, Badge, Card, Group, List, Stack, Table, Text, Timeline, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import type { MeetingType, Minutes, Topic } from '../api/types';
import { formatDuration } from '../lib/format';
import { PRIORITIES, topicLabel, topicsLabel } from '../lib/meeting';
import { MeetingTypeBadge, PriorityBadge } from './Badges';

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Stack gap="xs" component="section">
      <div>
        <Title order={4}>{title}</Title>
        {note && (
          <Text size="xs" c="dimmed">
            {note}
          </Text>
        )}
      </div>
      {children}
    </Stack>
  );
}

/** Sort position of a priority; an unknown one goes last. */
function priorityRank(priority: string): number {
  const rank = PRIORITIES.findIndex((known) => known === priority);
  return rank < 0 ? PRIORITIES.length : rank;
}

function TimeTag({ time }: { time: string }) {
  return time ? (
    <Badge variant="default" size="sm" ff="monospace" radius="sm">
      {time}
    </Badge>
  ) : null;
}

/** Values the minutes state that were not found in the transcript: to be checked before approving. */
export function WarningsAlert({ warnings }: { warnings: string[] }) {
  return (
    <Alert
      color="orange"
      variant="light"
      icon={<IconAlertTriangle />}
      title={`Check before approving (${warnings.length})`}
    >
      <Text size="sm" mb="xs">
        The automatic check did not find these values in the transcript. Compare them with the recording.
      </Text>
      <List size="sm" spacing={4}>
        {warnings.map((warning, index) => (
          <List.Item key={index}>{warning}</List.Item>
        ))}
      </List>
    </Alert>
  );
}

function TopicCard({ topic, minutes }: { topic: Topic; minutes: Minutes }) {
  const decisions = minutes.decisions.filter((decision) => decision.patient === topic.name);
  return (
    <Card withBorder padding="md">
      <Group justify="space-between" mb="xs">
        <Text fw={700}>{topic.name || 'Untitled'}</Text>
        <TimeTag time={topic.time} />
      </Group>
      <Text size="sm">
        <Text span fw={600}>
          Status:{' '}
        </Text>
        {topic.status || '—'}
      </Text>
      {topic.findings.length > 0 && (
        <>
          <Text size="sm" fw={600} mt="sm">
            Findings
          </Text>
          <List size="sm" spacing={2}>
            {topic.findings.map((finding, index) => (
              <List.Item key={index}>{finding}</List.Item>
            ))}
          </List>
        </>
      )}
      {decisions.length > 0 && (
        <>
          <Text size="sm" fw={600} mt="sm">
            Decisions
          </Text>
          <List size="sm" spacing={2}>
            {decisions.map((decision, index) => (
              <List.Item key={index}>
                <Group gap={6} wrap="nowrap" align="flex-start">
                  <TimeTag time={decision.time} />
                  <span>{decision.decision}</span>
                </Group>
              </List.Item>
            ))}
          </List>
        </>
      )}
    </Card>
  );
}

/** Read-only minutes, also used as the email preview. */
export function MinutesView({ minutes, meetingType }: { minutes: Minutes; meetingType: MeetingType }) {
  const participants = Object.entries(minutes.participants);
  const topicNames = new Set(minutes.topics.map((topic) => topic.name));
  const otherDecisions = minutes.decisions.filter((decision) => !topicNames.has(decision.patient));
  const actions = [...minutes.action_items].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));

  return (
    <Stack gap="xl">
      <Stack gap={6}>
        <Title order={2}>{minutes.title || 'Minutes of Meeting'}</Title>
        <Group gap="xs">
          <MeetingTypeBadge type={meetingType} />
        </Group>
      </Stack>

      {minutes.warnings.length > 0 && <WarningsAlert warnings={minutes.warnings} />}

      <Section title="Summary">
        <Text style={{ whiteSpace: 'pre-wrap' }}>{minutes.summary || '—'}</Text>
      </Section>

      {participants.length > 0 && (
        <Section title="Participants" note="Roles are guessed by the local AI from what each voice says.">
          <Table.ScrollContainer minWidth={420}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Speaker</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Talk time</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {participants.map(([speaker, participant]) => (
                  <Table.Tr key={speaker}>
                    <Table.Td>{speaker}</Table.Td>
                    <Table.Td>{participant.role || '—'}</Table.Td>
                    <Table.Td>{participant.name || '—'}</Table.Td>
                    <Table.Td>{formatDuration(participant.seconds)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Section>
      )}

      {minutes.key_moments.length > 0 && (
        <Section title="Key moments">
          <Timeline bulletSize={14} lineWidth={2} active={minutes.key_moments.length}>
            {minutes.key_moments.map((moment, index) => (
              <Timeline.Item key={index} title={<TimeTag time={moment.time} />}>
                <Text size="sm">{moment.moment}</Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Section>
      )}

      {minutes.topics.length > 0 && (
        <Section title={topicsLabel(meetingType)}>
          <Stack gap="sm">
            {minutes.topics.map((topic, index) => (
              <TopicCard key={index} topic={topic} minutes={minutes} />
            ))}
          </Stack>
        </Section>
      )}

      {otherDecisions.length > 0 && (
        <Section title="Other decisions">
          <List size="sm" spacing={4}>
            {otherDecisions.map((decision, index) => (
              <List.Item key={index}>
                {decision.decision}
                {decision.patient && ` — ${decision.patient}`}
              </List.Item>
            ))}
          </List>
        </Section>
      )}

      <Section title="Action items">
        {actions.length === 0 ? (
          <Text size="sm" c="dimmed">
            No action items.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table striped verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Task</Table.Th>
                  <Table.Th>{topicLabel(meetingType)}</Table.Th>
                  <Table.Th>Owner</Table.Th>
                  <Table.Th>Deadline</Table.Th>
                  <Table.Th>Priority</Table.Th>
                  <Table.Th>Time</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {actions.map((item, index) => (
                  <Table.Tr key={index}>
                    <Table.Td>{item.task}</Table.Td>
                    <Table.Td>{item.patient || '—'}</Table.Td>
                    <Table.Td>{item.owner || '—'}</Table.Td>
                    <Table.Td>{item.deadline || '—'}</Table.Td>
                    <Table.Td>
                      <PriorityBadge priority={item.priority} />
                    </Table.Td>
                    <Table.Td>
                      <TimeTag time={item.time} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Section>

      {minutes.open_issues.length > 0 && (
        <Section title="Open issues">
          <List size="sm" spacing={4}>
            {minutes.open_issues.map((issue, index) => (
              <List.Item key={index}>{issue}</List.Item>
            ))}
          </List>
        </Section>
      )}

      {minutes.suggestions.length > 0 && (
        <Section title="AI suggestions" note="Not decided in the meeting: follow-ups the local AI proposes.">
          <List size="sm" spacing={4}>
            {minutes.suggestions.map((suggestion, index) => (
              <List.Item key={index}>{suggestion}</List.Item>
            ))}
          </List>
        </Section>
      )}
    </Stack>
  );
}
