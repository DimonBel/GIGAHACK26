import {
  Alert,
  Box,
  Button,
  Group,
  List,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  UnstyledButton,
  VisuallyHidden,
} from '@mantine/core';
import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { useMinutesDocument, type MinutesForm, type Section } from './context';
import { AddButton, Block, DecisionEditRows, DecisionList, RemoveButton, TextLinesEdit, TimeLink } from './parts';

/** "[07:15] value(s) 3 not found..." -> the time and the rest. */
function splitWarning(warning: string): { time: string; text: string } {
  const match = /^\[(\d+:\d{2}(?::\d{2})?)\]\s*(.*)$/s.exec(warning);
  return match ? { time: match[1], text: match[2] } : { time: '', text: warning };
}

/** The counts at the top, each opening its section. */
function Stats() {
  const { t } = useTranslation('minutes');
  const { values, select } = useMinutesDocument();
  const first = values.topics[0];
  const stats: { label: string; value: number; section: Section | null }[] = [
    {
      label: t('labels.topics'),
      value: values.topics.length,
      section: first ? { kind: 'topic', key: first.key } : null,
    },
    { label: t('labels.decisions'), value: values.decisions.length, section: { kind: 'decisions' } },
    { label: t('labels.actionItems'), value: values.action_items.length, section: { kind: 'tasks' } },
    { label: t('overview.stats.speakers'), value: values.participants.length, section: { kind: 'participants' } },
    { label: t('overview.stats.present'), value: values.attendees.length, section: { kind: 'participants' } },
  ];
  return (
    <Paper withBorder style={{ overflow: 'hidden' }}>
      <SimpleGrid cols={{ base: 2, sm: 5 }} spacing={1} verticalSpacing={1} bg="gray.2">
        {stats.map(({ label, value, section }) => {
          const content = (
            <>
              <Text size="xs" c="dimmed">
                {label}
              </Text>
              <Text fz={26} fw={700} lh={1.2}>
                {value}
              </Text>
            </>
          );
          return section ? (
            <UnstyledButton key={label} bg="white" px="md" py="sm" onClick={() => select(section)} className="stat">
              {content}
            </UnstyledButton>
          ) : (
            <Box key={label} bg="white" px="md" py="sm">
              {content}
            </Box>
          );
        })}
      </SimpleGrid>
    </Paper>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  const { t } = useTranslation('minutes');
  return (
    <Alert
      color="orange"
      variant="light"
      icon={<IconAlertTriangle />}
      title={t('overview.warningsTitle', { count: warnings.length })}
    >
      <Stack gap={6}>
        <Text size="sm">{t('overview.warningsBody')}</Text>
        {warnings.map((warning, index) => {
          const { time, text } = splitWarning(warning);
          return (
            <Group key={index} gap="xs" wrap="nowrap" align="flex-start">
              {time && <TimeLink time={time} />}
              <Text size="sm">{text}</Text>
            </Group>
          );
        })}
      </Stack>
    </Alert>
  );
}

function WarningsEdit({ form, warnings }: { form: MinutesForm; warnings: string[] }) {
  const { t } = useTranslation('minutes');
  return (
    <Alert
      color="orange"
      variant="light"
      icon={<IconAlertTriangle />}
      title={t('overview.checkTitle', { count: warnings.length })}
    >
      <Text size="sm" mb="xs">
        {t('overview.checkBody')}
      </Text>
      <Stack gap={6}>
        {warnings.map((warning, index) => (
          <Group key={index} gap="xs" wrap="nowrap" align="flex-start">
            <Button
              size="compact-xs"
              variant="white"
              color="orange"
              leftSection={<IconCheck size={12} />}
              onClick={() => form.removeListItem('warnings', index)}
              aria-label={t('overview.markChecked', { warning })}
            >
              {t('overview.checked')}
            </Button>
            <Text size="sm">{warning}</Text>
          </Group>
        ))}
      </Stack>
    </Alert>
  );
}

function OverviewEditor({ form }: { form: MinutesForm }) {
  const { t } = useTranslation('minutes');
  const { values } = useMinutesDocument();
  return (
    <Stack gap="lg">
      <VisuallyHidden>
        <h2>{t('labels.overview')}</h2>
      </VisuallyHidden>
      <Stack gap="sm">
        <TextInput label={t('labels.title')} required size="md" {...form.getInputProps('title')} />
        <Textarea label={t('labels.summary')} autosize minRows={3} {...form.getInputProps('summary')} />
      </Stack>
      {values.warnings.length > 0 && <WarningsEdit form={form} warnings={values.warnings} />}
      <Block title={t('labels.keyMoments')}>
        {values.key_moments.map((_, index) => (
          <Group key={index} gap="xs" wrap="nowrap" align="flex-start">
            <TextInput
              w={76}
              placeholder={t('field.timePlaceholder')}
              aria-label={t('overview.keyMomentTimeLabel', { index: index + 1 })}
              {...form.getInputProps(`key_moments.${index}.time`)}
            />
            <Textarea
              autosize
              minRows={1}
              style={{ flex: 1 }}
              aria-label={t('overview.keyMomentLabel', { index: index + 1 })}
              {...form.getInputProps(`key_moments.${index}.moment`)}
            />
            <RemoveButton
              label={t('overview.removeKeyMoment', { index: index + 1 })}
              onClick={() => form.removeListItem('key_moments', index)}
            />
          </Group>
        ))}
        <AddButton
          label={t('overview.addKeyMoment')}
          onClick={() => form.insertListItem('key_moments', { time: '', moment: '' })}
        />
      </Block>
      <Block title={t('labels.otherDecisions')} note={t('overview.otherDecisionsNote')}>
        <DecisionEditRows which={(row) => !row.topic} newTopic="" />
      </Block>
      <Block title={t('labels.openIssues')}>
        <TextLinesEdit
          path="open_issues"
          items={values.open_issues}
          itemAriaLabel={(index) => t('overview.openIssueAria', { index })}
          removeLabel={(index) => t('overview.removeOpenIssue', { index })}
          addLabel={t('overview.addOpenIssue')}
        />
      </Block>
    </Stack>
  );
}

/** Title, summary, counts, warnings, key moments and what belongs to no single topic. */
export function OverviewSection() {
  const { t } = useTranslation('minutes');
  const { values, form } = useMinutesDocument();
  if (form) return <OverviewEditor form={form} />;

  const otherDecisions = values.decisions.filter((row) => !row.topic);
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Title order={2}>{values.title || t('overview.titleFallback')}</Title>
        <Text size="lg" maw="70ch" style={{ whiteSpace: 'pre-wrap' }} c={values.summary ? undefined : 'dimmed'}>
          {values.summary || t('overview.noSummary')}
        </Text>
      </Stack>
      <Stats />
      {values.warnings.length > 0 && <Warnings warnings={values.warnings} />}
      {values.key_moments.length > 0 && (
        <Block title={t('labels.keyMoments')}>
          <Stack gap={8}>
            {values.key_moments.map((moment, index) => (
              <Group key={index} gap="sm" wrap="nowrap" align="flex-start">
                <Box w={52} style={{ flexShrink: 0 }}>
                  <TimeLink time={moment.time} />
                </Box>
                <Text size="sm">{moment.moment}</Text>
              </Group>
            ))}
          </Stack>
        </Block>
      )}
      {otherDecisions.length > 0 && (
        <Block title={t('labels.otherDecisions')}>
          <DecisionList rows={otherDecisions} withTopic />
        </Block>
      )}
      {values.open_issues.length > 0 && (
        <Block title={t('labels.openIssues')}>
          <List size="sm" spacing={4}>
            {values.open_issues.map((issue, index) => (
              <List.Item key={index}>{issue}</List.Item>
            ))}
          </List>
        </Block>
      )}
    </Stack>
  );
}
