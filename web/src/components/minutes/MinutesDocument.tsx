import { Badge, Box, Button, Group, NativeSelect, NavLink, Paper, ScrollArea, Text, ThemeIcon } from '@mantine/core';
import { IconChecklist, IconGavel, IconLayoutList, IconPlus, IconUsers } from '@tabler/icons-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import type { MeetingType } from '../../api/types';
import { HEADER_HEIGHT } from '../../lib/layout';
import { timeToSeconds, topicAt } from '../../lib/minutesDoc';
import { newTopicKey, type MinutesFormValues } from '../../lib/minutesForm';
import {
  DocumentContext,
  useMinutesNav,
  type MinutesDocumentContext,
  type MinutesForm,
  type MinutesNav,
  type Section,
} from './context';
import { DecisionsSection } from './DecisionsSection';
import { OverviewSection } from './OverviewSection';
import { ParticipantsSection } from './ParticipantsSection';
import { TasksSection } from './TasksSection';
import { TopicSection } from './TopicSection';

interface MinutesDocumentProps {
  values: MinutesFormValues;
  meetingType: MeetingType;
  /** Edit mode: the form that holds values. */
  form?: MinutesForm;
  /** The meeting whose transcript and recording can be opened next to each topic (moderators, admins). */
  transcriptOf?: string;
  /** The open section, when the page needs to open one itself. */
  nav?: MinutesNav;
  /** Where the sidebar sticks, below the page's own sticky bars. */
  stickyTop?: number;
  /** A section picker above the section instead of the sidebar, at every width (a narrow column). */
  compactNav?: boolean;
}

function sectionValue(section: Section): string {
  return section.kind === 'topic' ? `topic:${section.key}` : section.kind;
}

function valueSection(value: string): Section {
  if (value.startsWith('topic:')) return { kind: 'topic', key: value.slice('topic:'.length) };
  return { kind: value as 'overview' | 'participants' | 'decisions' | 'tasks' };
}

function GroupLabel({ children, count }: { children: string; count?: number }) {
  return (
    <Group justify="space-between" px="sm" mt="md" mb={4}>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={0.4}>
        {children}
      </Text>
      {count !== undefined && (
        <Text size="xs" c="dimmed">
          {count}
        </Text>
      )}
    </Group>
  );
}

/** Minutes as a document: an overview, one page per topic (a patient, an agenda item), the participants and the
 *  action items, with a sidebar to move between them. Also the editor, when given the form. */
export function MinutesDocument({
  values,
  meetingType,
  form,
  transcriptOf,
  nav: givenNav,
  stickyTop = HEADER_HEIGHT + 16,
  compactNav = false,
}: MinutesDocumentProps) {
  const { t } = useTranslation('minutes');
  const ownNav = useMinutesNav();
  const nav = givenNav ?? ownNav;
  const panel = useRef<HTMLDivElement>(null);
  const focusCount = useRef(0);

  const open = nav.section;
  const topicIndex = open.kind === 'topic' ? values.topics.findIndex((topic) => topic.key === open.key) : -1;
  // A deleted topic's page falls back to the overview.
  const section: Section = open.kind === 'topic' && topicIndex < 0 ? { kind: 'overview' } : open;

  /** The new section is read from its top, and keyboard focus moves into it (the button that opened it may be
   *  gone). An input the section focuses itself (a new topic's name) takes the focus after this. */
  const showPanel = (scroll: boolean) => {
    const element = panel.current;
    if (!element) return;
    if (scroll && element.getBoundingClientRect().top < stickyTop) element.scrollIntoView({ block: 'start' });
    element.focus({ preventScroll: true });
  };

  const select = (next: Section) => {
    nav.setSection(next);
    nav.setFocus(null);
    showPanel(true);
  };

  const openTime = (time: string, topic?: string) => {
    const seconds = timeToSeconds(time);
    if (seconds === null) return;
    const index =
      topic === undefined ? topicAt(values.topics, seconds) : values.topics.findIndex((t) => t.key === topic);
    if (index < 0) return;
    const key = values.topics[index].key;
    focusCount.current += 1;
    nav.setSection({ kind: 'topic', key });
    nav.setFocus({ topic: key, seconds, at: focusCount.current });
    // With the transcript, its excerpt scrolls to the line said then; without it, show the topic from its top.
    showPanel(transcriptOf === undefined);
  };

  const addTopic = () => {
    if (!form) return;
    const key = newTopicKey();
    form.insertListItem('topics', { key, name: '', time: '', status: '', findings: [] });
    select({ kind: 'topic', key });
  };

  const context: MinutesDocumentContext = {
    values,
    meetingType,
    form: form ?? null,
    transcriptOf: transcriptOf ?? null,
    focus: nav.focus,
    select,
    openTime,
    clearFocus: () => nav.setFocus(null),
  };

  const itemCount = (key: string, findings: number) =>
    findings +
    values.decisions.filter((row) => row.topic === key).length +
    values.action_items.filter((row) => row.topic === key).length;
  const topicName = (name: string, index: number) => name.trim() || t('document.topicNumbered', { number: index + 1 });

  return (
    <DocumentContext.Provider value={context}>
      <div className={compactNav ? 'minutes-document minutes-document-compact' : 'minutes-document'}>
        {!compactNav && (
          <Box visibleFrom="md" pos="sticky" top={stickyTop}>
            <ScrollArea.Autosize mah={`calc(100vh - ${stickyTop + 16}px)`} type="hover" offsetScrollbars>
              <nav aria-label={t('document.sectionsLabel')}>
                <NavLink
                  component="button"
                  type="button"
                  label={t('labels.overview')}
                  leftSection={<IconLayoutList size={18} stroke={1.6} />}
                  active={section.kind === 'overview'}
                  aria-current={section.kind === 'overview' ? 'true' : undefined}
                  onClick={() => select({ kind: 'overview' })}
                />
                <GroupLabel count={values.topics.length}>{t('labels.topics')}</GroupLabel>
                {values.topics.map((topic, index) => {
                  const active = section.kind === 'topic' && section.key === topic.key;
                  const count = itemCount(topic.key, topic.findings.length);
                  return (
                    <NavLink
                      key={topic.key}
                      component="button"
                      type="button"
                      active={active}
                      aria-current={active ? 'true' : undefined}
                      onClick={() => select({ kind: 'topic', key: topic.key })}
                      leftSection={
                        <ThemeIcon
                          size={24}
                          radius="sm"
                          variant={active ? 'filled' : 'light'}
                          color={active ? 'teal' : 'gray'}
                        >
                          <Text size="xs" fw={700}>
                            {String(index + 1).padStart(2, '0')}
                          </Text>
                        </ThemeIcon>
                      }
                      label={
                        <Text size="sm" fw={500} lineClamp={2}>
                          {topicName(topic.name, index)}
                        </Text>
                      }
                      description={[topic.time, t('document.itemCount', { count })].filter(Boolean).join(' · ')}
                    />
                  );
                })}
                {form && (
                  <Button
                    variant="subtle"
                    color="gray"
                    size="xs"
                    leftSection={<IconPlus size={14} />}
                    onClick={addTopic}
                    mt={4}
                    fullWidth
                    justify="flex-start"
                  >
                    {t('document.addTopic')}
                  </Button>
                )}
                <GroupLabel>{t('labels.general')}</GroupLabel>
                <NavLink
                  component="button"
                  type="button"
                  label={t('labels.participants')}
                  leftSection={<IconUsers size={18} stroke={1.6} />}
                  rightSection={
                    <Badge size="sm" variant="light" color="gray">
                      {values.participants.length}
                    </Badge>
                  }
                  active={section.kind === 'participants'}
                  aria-current={section.kind === 'participants' ? 'true' : undefined}
                  onClick={() => select({ kind: 'participants' })}
                />
                <NavLink
                  component="button"
                  type="button"
                  label={t('labels.decisions')}
                  leftSection={<IconGavel size={18} stroke={1.6} />}
                  rightSection={
                    <Badge size="sm" variant="light" color="gray">
                      {values.decisions.length}
                    </Badge>
                  }
                  active={section.kind === 'decisions'}
                  aria-current={section.kind === 'decisions' ? 'true' : undefined}
                  onClick={() => select({ kind: 'decisions' })}
                />
                <NavLink
                  component="button"
                  type="button"
                  label={t('labels.actionItems')}
                  leftSection={<IconChecklist size={18} stroke={1.6} />}
                  rightSection={
                    <Badge size="sm" variant="light" color="gray">
                      {values.action_items.length}
                    </Badge>
                  }
                  active={section.kind === 'tasks'}
                  aria-current={section.kind === 'tasks' ? 'true' : undefined}
                  onClick={() => select({ kind: 'tasks' })}
                />
              </nav>
            </ScrollArea.Autosize>
          </Box>
        )}

        <Box hiddenFrom={compactNav ? undefined : 'md'}>
          <Group gap="xs" wrap="nowrap" align="flex-end">
            <NativeSelect
              data-autofocus={compactNav || undefined}
              label={t('labels.section')}
              style={{ flex: 1 }}
              value={sectionValue(section)}
              onChange={(event) => select(valueSection(event.currentTarget.value))}
              data={[
                { value: 'overview', label: t('labels.overview') },
                {
                  group: t('labels.topics'),
                  items: values.topics.map((topic, index) => ({
                    value: `topic:${topic.key}`,
                    label: `${String(index + 1).padStart(2, '0')} · ${topicName(topic.name, index)}`,
                  })),
                },
                {
                  group: t('labels.general'),
                  items: [
                    { value: 'participants', label: t('labels.participants') },
                    { value: 'decisions', label: t('labels.decisions') },
                    { value: 'tasks', label: t('labels.actionItems') },
                  ],
                },
              ]}
            />
            {form && (
              <Button variant="default" leftSection={<IconPlus size={14} />} onClick={addTopic}>
                {t('document.addTopic')}
              </Button>
            )}
          </Group>
        </Box>

        <Paper
          ref={panel}
          tabIndex={-1}
          withBorder
          p={{ base: 'md', sm: 'xl' }}
          style={{ minWidth: 0, scrollMarginTop: stickyTop, outline: 'none' }}
        >
          {section.kind === 'overview' && <OverviewSection />}
          {section.kind === 'topic' && <TopicSection key={section.key} index={topicIndex} />}
          {section.kind === 'participants' && <ParticipantsSection />}
          {section.kind === 'decisions' && <DecisionsSection />}
          {section.kind === 'tasks' && <TasksSection />}
        </Paper>
      </div>
    </DocumentContext.Provider>
  );
}
