import {
  Accordion,
  ActionIcon,
  Affix,
  Badge,
  Button,
  Container,
  Grid,
  Group,
  Modal,
  Paper,
  SegmentedControl,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Transition,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import {
  IconAdjustmentsHorizontal,
  IconChevronDown,
  IconChevronUp,
  IconDeviceFloppy,
  IconEye,
  IconHistory,
  IconListCheck,
  IconRestore,
} from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCreateTemplateVersion, useRestoreTemplateVersion, useTemplateVersions } from '../../api/queries';
import type { MeetingType, Minutes, MinutesTemplate } from '../../api/types';
import { MinutesView } from '../../components/MinutesView';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { TablePagination } from '../../components/TablePagination';
import { usePaged } from '../../hooks/usePaged';
import { currentLanguage, type Language } from '../../i18n';
import { formatDateTime } from '../../lib/format';
import { PAGE_WIDTH } from '../../lib/layout';
import { meetingTypeOptions } from '../../lib/meeting';
import { notifySuccess } from '../../lib/notify';
import { MAX_INSTRUCTIONS_LENGTH, MAX_NOTE_LENGTH } from '../../lib/templates';

/** A plausible date and length for the sample meeting below (invented, like its minutes). */
const SAMPLE_MEETING_DATE = '2026-09-24T09:00:00Z';
const SAMPLE_MEETING_DURATION_S = 1980;

/** Short, invented meeting minutes used only to render a realistic live preview; never sent anywhere. Shown in
 *  the page's own language (not the meeting type), so a Romanian-speaking admin reads a Romanian example. */
const SAMPLE_MINUTES: Record<Language, Minutes> = {
  en: {
    title: 'Weekly Department Meeting — 24 Sep',
    summary:
      "The team reviewed last week's action items, discussed the new patient intake process, and agreed on next steps before the upcoming audit.",
    key_moments: [
      { time: '00:02', moment: 'Meeting opened and the agenda was confirmed.' },
      { time: '00:18', moment: 'Decision to adopt the new intake process.' },
    ],
    topics: [
      {
        name: 'Patient intake process',
        time: '00:05',
        status: 'In progress',
        findings: ['Average wait time dropped to 12 minutes.', 'Two staff still need training on the new form.'],
      },
      {
        name: 'Budget for next quarter',
        time: '00:20',
        status: 'Reviewed',
        findings: ['Spending is within the approved plan.'],
      },
    ],
    decisions: [
      { decision: 'Adopt the new intake form starting Monday.', time: '00:14', patient: 'Patient intake process' },
      {
        decision: 'Delay the equipment purchase to next quarter.',
        time: '00:25',
        patient: 'Budget for next quarter',
      },
      { decision: 'Move the next meeting to Thursdays.', time: '00:30', patient: '' },
    ],
    action_items: [
      {
        task: 'Train the remaining staff on the intake form',
        owner: 'Maria Ionescu',
        deadline: '3 Oct',
        priority: 'high',
        time: '00:16',
        patient: 'Patient intake process',
      },
      {
        task: 'Send the budget summary to finance',
        owner: 'Radu Popa',
        deadline: '1 Oct',
        priority: 'medium',
        time: '00:22',
        patient: 'Budget for next quarter',
      },
    ],
    open_issues: ['Who covers the front desk during the training sessions?'],
    warnings: ['The deadline "3 Oct" was not found in the transcript.'],
    attendees: [
      {
        user_id: null,
        name: 'Dr. Elena Vasilescu',
        job_title: 'Head of Department',
        position: 'Doctor',
        specialty: 'Cardiology',
      },
      { user_id: null, name: 'Maria Ionescu', job_title: 'Nurse Manager', position: 'Nurse', specialty: '' },
    ],
    participants: {
      'Speaker 1': { role: 'Head of Department', name: 'Dr. Elena Vasilescu', seconds: 420 },
      'Speaker 2': { role: 'Nurse Manager', name: 'Maria Ionescu', seconds: 260 },
    },
  },
  ro: {
    title: 'Ședința săptămânală de departament — 24 sept.',
    summary:
      'Echipa a analizat sarcinile din săptămâna trecută, a discutat noul proces de internare a pacienților și a stabilit pașii următori înaintea auditului care urmează.',
    key_moments: [
      { time: '00:02', moment: 'Ședința a început și agenda a fost confirmată.' },
      { time: '00:18', moment: 'Decizie privind adoptarea noului proces de internare.' },
    ],
    topics: [
      {
        name: 'Procesul de internare a pacienților',
        time: '00:05',
        status: 'În desfășurare',
        findings: [
          'Timpul mediu de așteptare a scăzut la 12 minute.',
          'Doi angajați mai trebuie instruiți pentru noul formular.',
        ],
      },
      {
        name: 'Bugetul pentru trimestrul următor',
        time: '00:20',
        status: 'Analizat',
        findings: ['Cheltuielile se încadrează în planul aprobat.'],
      },
    ],
    decisions: [
      {
        decision: 'Se adoptă noul formular de internare începând de luni.',
        time: '00:14',
        patient: 'Procesul de internare a pacienților',
      },
      {
        decision: 'Achiziția echipamentului se amână pentru trimestrul următor.',
        time: '00:25',
        patient: 'Bugetul pentru trimestrul următor',
      },
      { decision: 'Următoarea ședință se mută joia.', time: '00:30', patient: '' },
    ],
    action_items: [
      {
        task: 'Instruirea angajaților rămași pentru noul formular',
        owner: 'Maria Ionescu',
        deadline: '3 oct.',
        priority: 'high',
        time: '00:16',
        patient: 'Procesul de internare a pacienților',
      },
      {
        task: 'Trimiterea rezumatului bugetar către contabilitate',
        owner: 'Radu Popa',
        deadline: '1 oct.',
        priority: 'medium',
        time: '00:22',
        patient: 'Bugetul pentru trimestrul următor',
      },
    ],
    open_issues: ['Cine preia recepția în timpul sesiunilor de instruire?'],
    warnings: ['Termenul „3 oct.” nu a fost găsit în transcriere.'],
    attendees: [
      {
        user_id: null,
        name: 'Dr. Elena Vasilescu',
        job_title: 'Șefă de departament',
        position: 'Medic',
        specialty: 'Cardiologie',
      },
      {
        user_id: null,
        name: 'Maria Ionescu',
        job_title: 'Asistentă-șefă',
        position: 'Asistentă medicală',
        specialty: '',
      },
    ],
    participants: {
      'Vorbitor 1': { role: 'Șefă de departament', name: 'Dr. Elena Vasilescu', seconds: 420 },
      'Vorbitor 2': { role: 'Asistentă-șefă', name: 'Maria Ionescu', seconds: 260 },
    },
  },
  ru: {
    title: 'Еженедельное совещание отдела — 24 сент.',
    summary:
      'Команда рассмотрела задачи прошлой недели, обсудила новый процесс приёма пациентов и согласовала дальнейшие шаги перед предстоящей проверкой.',
    key_moments: [
      { time: '00:02', moment: 'Совещание началось, повестка утверждена.' },
      { time: '00:18', moment: 'Принято решение о новом процессе приёма.' },
    ],
    topics: [
      {
        name: 'Процесс приёма пациентов',
        time: '00:05',
        status: 'В процессе',
        findings: ['Среднее время ожидания снизилось до 12 минут.', 'Двух сотрудников ещё нужно обучить новой форме.'],
      },
      {
        name: 'Бюджет на следующий квартал',
        time: '00:20',
        status: 'Рассмотрено',
        findings: ['Расходы соответствуют утверждённому плану.'],
      },
    ],
    decisions: [
      { decision: 'Внедрить новую форму приёма с понедельника.', time: '00:14', patient: 'Процесс приёма пациентов' },
      {
        decision: 'Перенести закупку оборудования на следующий квартал.',
        time: '00:25',
        patient: 'Бюджет на следующий квартал',
      },
      { decision: 'Перенести следующее совещание на четверги.', time: '00:30', patient: '' },
    ],
    action_items: [
      {
        task: 'Обучить оставшихся сотрудников новой форме',
        owner: 'Мария Ионеску',
        deadline: '3 окт.',
        priority: 'high',
        time: '00:16',
        patient: 'Процесс приёма пациентов',
      },
      {
        task: 'Отправить сводку по бюджету в бухгалтерию',
        owner: 'Раду Попа',
        deadline: '1 окт.',
        priority: 'medium',
        time: '00:22',
        patient: 'Бюджет на следующий квартал',
      },
    ],
    open_issues: ['Кто останется на ресепшене во время обучения?'],
    warnings: ['Срок «3 окт.» не найден в транскрипте.'],
    attendees: [
      {
        user_id: null,
        name: 'Др. Елена Василеску',
        job_title: 'Заведующая отделением',
        position: 'Врач',
        specialty: 'Кардиология',
      },
      { user_id: null, name: 'Мария Ионеску', job_title: 'Старшая медсестра', position: 'Медсестра', specialty: '' },
    ],
    participants: {
      'Говорящий 1': { role: 'Заведующая отделением', name: 'Др. Елена Василеску', seconds: 420 },
      'Говорящий 2': { role: 'Старшая медсестра', name: 'Мария Ионеску', seconds: 260 },
    },
  },
};

/** The template fields being edited for one meeting type. The save note is kept separately (see `TypeEditor`):
 *  it describes the version about to be created, not something that belongs to the draft itself. */
interface Draft {
  sections: MinutesTemplate['sections'];
  topic_fields: MinutesTemplate['topic_fields'];
  instructions: string;
}

function draftFrom(template: Pick<MinutesTemplate, 'sections' | 'topic_fields' | 'instructions'>): Draft {
  return { sections: template.sections, topic_fields: template.topic_fields, instructions: template.instructions };
}

/** `MinutesView` (the real email document), fed short invented sample content in the page's own language, and
 *  laid out with the given sections and topic fields — a draft being edited, or a past version — instead of the
 *  meeting type's saved template (`MinutesView` only reads that one on its own). */
function TemplatePreview({
  sections,
  topicFields,
  meetingType,
}: {
  sections: MinutesTemplate['sections'];
  topicFields: MinutesTemplate['topic_fields'];
  meetingType: MeetingType;
}) {
  const { t } = useTranslation('templates');
  const language = currentLanguage();
  const minutes = SAMPLE_MINUTES[language];
  return (
    <Stack gap="sm">
      {sections.every((section) => !section.enabled) && (
        <Text size="sm" c="orange.8">
          {t('preview.empty')}
        </Text>
      )}
      <MinutesView
        minutes={minutes}
        meetingType={meetingType}
        language={language}
        meeting={{
          title: minutes.title,
          created_at: SAMPLE_MEETING_DATE,
          duration_s: SAMPLE_MEETING_DURATION_S,
          approved_by: null,
        }}
        template={{
          meeting_type: meetingType,
          version: 0,
          sections,
          topic_fields: topicFields,
          instructions: '',
          note: '',
          created_by: null,
          created_at: null,
        }}
      />
    </Stack>
  );
}

function HistoryTable({
  versions,
  onView,
  onRestore,
  restoring,
}: {
  versions: MinutesTemplate[];
  onView: (template: MinutesTemplate) => void;
  onRestore: (template: MinutesTemplate) => void;
  restoring: boolean;
}) {
  const { t } = useTranslation(['templates', 'common']);
  const paged = usePaged(versions);
  const activeVersion = versions[0].version;
  return (
    <>
      <Paper withBorder>
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('history.table.version', { ns: 'templates' })}</Table.Th>
                <Table.Th>{t('history.table.date', { ns: 'templates' })}</Table.Th>
                <Table.Th>{t('history.table.author', { ns: 'templates' })}</Table.Th>
                <Table.Th>{t('history.table.note', { ns: 'templates' })}</Table.Th>
                <Table.Th w={170}>{t('history.table.actions', { ns: 'templates' })}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paged.items.map((version) => (
                <Table.Tr key={version.version}>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm">{version.version}</Text>
                      {version.version === activeVersion && (
                        <Badge color="teal" variant="light" size="sm">
                          {t('history.activeBadge', { ns: 'templates' })}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>{formatDateTime(version.created_at)}</Table.Td>
                  <Table.Td>{version.created_by?.full_name ?? t('history.builtIn', { ns: 'templates' })}</Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={2}>
                      {version.note || '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Button
                        size="xs"
                        variant="default"
                        leftSection={<IconEye size={14} />}
                        onClick={() => onView(version)}
                      >
                        {t('history.view', { ns: 'templates' })}
                      </Button>
                      {version.version !== activeVersion && (
                        <Button
                          size="xs"
                          variant="light"
                          leftSection={<IconRestore size={14} />}
                          disabled={restoring}
                          onClick={() => onRestore(version)}
                        >
                          {t('history.restore', { ns: 'templates' })}
                        </Button>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
      <TablePagination paged={paged} />
    </>
  );
}

/** A sticky bar shown only while the current meeting type's draft has unsaved edits: an optional note on what
 *  changed, and Discard / Save. Floats above the page (a portal), so it works regardless of scroll position. */
function UnsavedChangesBar({
  dirty,
  saving,
  note,
  onNoteChange,
  noteError,
  canSave,
  onDiscard,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  note: string;
  onNoteChange: (value: string) => void;
  noteError: string | null;
  canSave: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation('templates');
  return (
    <Affix position={{ bottom: 0, left: 0, right: 0 }} zIndex={150}>
      <Transition transition="slide-up" mounted={dirty}>
        {(styles) => (
          <Paper style={styles} withBorder shadow="lg" radius={0} py="sm" className="no-print">
            <Container size={PAGE_WIDTH} px={{ base: 'md', sm: 'lg' }}>
              <Group justify="space-between" gap="sm" wrap="wrap">
                <Badge size="lg" variant="light" color="yellow">
                  {t('editor.unsavedBadge')}
                </Badge>
                <Group gap="sm" wrap="wrap" justify="flex-end" style={{ flex: 1 }}>
                  <TextInput
                    size="sm"
                    placeholder={t('editor.notePlaceholder')}
                    aria-label={t('editor.noteLabel')}
                    value={note}
                    onChange={(event) => onNoteChange(event.currentTarget.value)}
                    error={noteError}
                    maxLength={MAX_NOTE_LENGTH}
                    style={{ flex: '1 1 220px', maxWidth: 340 }}
                  />
                  <Button variant="default" onClick={onDiscard} disabled={saving}>
                    {t('editor.discard')}
                  </Button>
                  <Button
                    leftSection={<IconDeviceFloppy size={16} />}
                    onClick={onSave}
                    loading={saving}
                    disabled={!canSave}
                  >
                    {t('editor.save')}
                  </Button>
                </Group>
              </Group>
            </Container>
          </Paper>
        )}
      </Transition>
    </Affix>
  );
}

/** The editor, live preview and version history of one meeting type. Mounted with `key={type}` so switching type
 *  starts a fresh form seeded from that type's kept draft (if any) or its active version. */
function TypeEditor({
  type,
  versions,
  draft,
  onLeave,
  onView,
}: {
  type: MeetingType;
  versions: MinutesTemplate[];
  /** The unsaved values kept from the last time this type was edited, if any. */
  draft?: Draft;
  /** Called once, when this type is no longer being edited, with its last values (kept so switching meeting type
   *  never silently loses an unsaved edit). */
  onLeave: (type: MeetingType, values: Draft) => void;
  onView: (template: MinutesTemplate) => void;
}) {
  const { t } = useTranslation(['templates', 'common']);
  const createVersion = useCreateTemplateVersion(type);
  const restore = useRestoreTemplateVersion(type);
  // What changed, for the version about to be saved; not part of the draft (see the `Draft` comment above).
  const [note, setNote] = useState('');
  // The active version: unsaved changes are measured against it (also a kept draft's) and Discard goes back to it.
  const [saved, setSaved] = useState(() => draftFrom(versions[0]));

  const form = useForm<Draft>({
    mode: 'controlled',
    initialValues: draft ?? saved,
    validate: {
      instructions: (value) =>
        value.length <= MAX_INSTRUCTIONS_LENGTH
          ? null
          : t('editor.instructionsTooLong', { ns: 'templates', max: MAX_INSTRUCTIONS_LENGTH }),
    },
  });

  // A ref mirroring the latest values, read only from the unmount effect below (never during render).
  const valuesRef = useRef(form.values);
  useEffect(() => {
    valuesRef.current = form.values;
  });
  useEffect(() => () => onLeave(type, valuesRef.current), [onLeave, type]);

  const dirty = JSON.stringify(form.values) !== JSON.stringify(saved);

  const noteError =
    note.length > MAX_NOTE_LENGTH ? t('editor.noteTooLong', { ns: 'templates', max: MAX_NOTE_LENGTH }) : null;

  /** After a save or a restore, the new version becomes the clean baseline. */
  const applyActive = (created: MinutesTemplate) => {
    const next = draftFrom(created);
    form.setValues(next);
    setSaved(next);
    setNote('');
  };

  const submit = form.onSubmit((values) => {
    if (noteError) return;
    createVersion.mutate(
      {
        sections: values.sections,
        topic_fields: values.topic_fields,
        instructions: values.instructions.trim(),
        note: note.trim(),
      },
      {
        onSuccess: (created) => {
          applyActive(created);
          notifySuccess(t('editor.saved', { ns: 'templates', version: created.version }));
        },
      },
    );
  });

  const confirmRestore = (version: MinutesTemplate) =>
    modals.openConfirmModal({
      title: t('history.restoreConfirm.title', { ns: 'templates', version: version.version }),
      centered: true,
      children: (
        <Text size="sm">{t('history.restoreConfirm.body', { ns: 'templates', version: version.version })}</Text>
      ),
      labels: { confirm: t('history.restore', { ns: 'templates' }), cancel: t('common:action.cancel') },
      onConfirm: () =>
        restore.mutate(version.version, {
          onSuccess: (created) => {
            applyActive(created);
            notifySuccess(t('history.restored', { ns: 'templates', version: created.version }));
          },
        }),
    });

  const move = (index: number, delta: number) => {
    const next = [...form.values.sections];
    const target = index + delta;
    [next[index], next[target]] = [next[target], next[index]];
    form.setFieldValue('sections', next);
  };

  return (
    // Room at the bottom for the bar of unsaved changes, so it never covers the end of the page.
    <Stack gap="lg" pb={dirty ? 96 : undefined}>
      <Tabs defaultValue="editor" keepMountedMode="display-none">
        <Tabs.List mb="md">
          <Tabs.Tab value="editor" leftSection={<IconListCheck size={16} />}>
            {t('editor.tabLabel', { ns: 'templates' })}
          </Tabs.Tab>
          <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>
            {t('history.title', { ns: 'templates' })} · {versions.length}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="editor">
          <form onSubmit={submit} noValidate>
            <Grid gap="lg">
              <Grid.Col span={{ base: 12, md: 5 }}>
                <Paper withBorder p="lg">
                  <Stack gap="md">
                    <div>
                      <Title order={4}>{t('editor.sectionsTitle', { ns: 'templates' })}</Title>
                      <Text size="xs" c="dimmed">
                        {t('editor.sectionsDescription', { ns: 'templates' })}
                      </Text>
                    </div>
                    <Stack gap={6}>
                      {form.values.sections.map((section, index) => {
                        const label = t(`sections.${section.key}.label`, { ns: 'templates' });
                        return (
                          <Paper
                            key={section.key}
                            withBorder
                            radius="md"
                            p="xs"
                            style={{ opacity: section.enabled ? 1 : 0.55, transition: 'opacity 150ms ease' }}
                          >
                            <Group wrap="nowrap" gap="xs" align="center">
                              <Stack gap={0}>
                                <ActionIcon
                                  type="button"
                                  variant="subtle"
                                  size="sm"
                                  disabled={index === 0}
                                  aria-label={t('editor.moveUpAria', { ns: 'templates', section: label })}
                                  onClick={() => move(index, -1)}
                                >
                                  <IconChevronUp size={14} />
                                </ActionIcon>
                                <ActionIcon
                                  type="button"
                                  variant="subtle"
                                  size="sm"
                                  disabled={index === form.values.sections.length - 1}
                                  aria-label={t('editor.moveDownAria', { ns: 'templates', section: label })}
                                  onClick={() => move(index, 1)}
                                >
                                  <IconChevronDown size={14} />
                                </ActionIcon>
                              </Stack>
                              <Switch
                                style={{ flex: 1 }}
                                label={label}
                                description={t(`sections.${section.key}.description`, { ns: 'templates' })}
                                {...form.getInputProps(`sections.${index}.enabled`, { type: 'checkbox' })}
                              />
                            </Group>
                          </Paper>
                        );
                      })}
                    </Stack>

                    <Accordion variant="separated" keepMounted={false}>
                      <Accordion.Item value="advanced">
                        <Accordion.Control icon={<IconAdjustmentsHorizontal size={16} />}>
                          {t('editor.advanced', { ns: 'templates' })}
                        </Accordion.Control>
                        <Accordion.Panel>
                          <Stack gap="md">
                            <Text size="xs" c="dimmed">
                              {t('editor.advancedDescription', { ns: 'templates' })}
                            </Text>
                            <div>
                              <Text size="sm" fw={500}>
                                {t('editor.topicFieldsTitle', { ns: 'templates' })}
                              </Text>
                              <Text size="xs" c="dimmed" mb={6}>
                                {t('editor.topicFieldsDescription', { ns: 'templates' })}
                              </Text>
                              <Group>
                                <Switch
                                  label={t('topicFields.status', { ns: 'templates' })}
                                  {...form.getInputProps('topic_fields.status', { type: 'checkbox' })}
                                />
                                <Switch
                                  label={t('topicFields.findings', { ns: 'templates' })}
                                  {...form.getInputProps('topic_fields.findings', { type: 'checkbox' })}
                                />
                                <Switch
                                  label={t('topicFields.decisions', { ns: 'templates' })}
                                  {...form.getInputProps('topic_fields.decisions', { type: 'checkbox' })}
                                />
                              </Group>
                            </div>
                            <Stack gap={4}>
                              <Textarea
                                label={t('editor.instructionsLabel', { ns: 'templates' })}
                                description={t('editor.instructionsDescription', { ns: 'templates' })}
                                autosize
                                minRows={3}
                                maxRows={8}
                                maxLength={MAX_INSTRUCTIONS_LENGTH}
                                {...form.getInputProps('instructions')}
                              />
                              <Text size="xs" c="dimmed" ta="right">
                                {t('editor.counter', {
                                  ns: 'templates',
                                  count: form.values.instructions.length,
                                  max: MAX_INSTRUCTIONS_LENGTH,
                                })}
                              </Text>
                            </Stack>
                          </Stack>
                        </Accordion.Panel>
                      </Accordion.Item>
                    </Accordion>
                  </Stack>
                </Paper>
              </Grid.Col>

              <Grid.Col span={{ base: 12, md: 7 }}>
                <Paper withBorder p="lg" className="no-print">
                  <Stack gap="md">
                    <div>
                      <Title order={4}>{t('preview.title', { ns: 'templates' })}</Title>
                      <Text size="xs" c="dimmed">
                        {t('preview.description', { ns: 'templates' })}
                      </Text>
                    </div>
                    <div style={{ maxHeight: 640, overflowY: 'auto' }}>
                      <TemplatePreview
                        sections={form.values.sections}
                        topicFields={form.values.topic_fields}
                        meetingType={type}
                      />
                    </div>
                  </Stack>
                </Paper>
              </Grid.Col>
            </Grid>
          </form>
        </Tabs.Panel>

        <Tabs.Panel value="history">
          <Text size="sm" c="dimmed" mb="sm">
            {t('history.intro', { ns: 'templates' })}
          </Text>
          <HistoryTable versions={versions} onView={onView} onRestore={confirmRestore} restoring={restore.isPending} />
        </Tabs.Panel>
      </Tabs>

      <UnsavedChangesBar
        dirty={dirty}
        saving={createVersion.isPending}
        note={note}
        onNoteChange={setNote}
        noteError={noteError}
        canSave={dirty && !noteError}
        onDiscard={() => {
          form.setValues(saved);
          form.clearErrors();
          setNote('');
        }}
        onSave={() => submit()}
      />
    </Stack>
  );
}

/** The minutes template of each meeting type: what the emailed minutes contain and in what order, a live preview,
 *  and the version history. */
export function TemplatesPage() {
  const { t } = useTranslation(['templates', 'common']);
  const [type, setType] = useState<MeetingType>('medical');
  const versions = useTemplateVersions(type);
  // Unsaved edits per meeting type, so switching type never silently loses them; plain state (not a ref), since
  // it is read during render to seed the editor.
  const [drafts, setDrafts] = useState<Partial<Record<MeetingType, Draft>>>({});
  const keepDraft = useCallback((leftType: MeetingType, values: Draft) => {
    setDrafts((current) => ({ ...current, [leftType]: values }));
  }, []);
  const [viewing, setViewing] = useState<MinutesTemplate | null>(null);

  const header = <PageHeader title={t('common:nav.templates')} description={t('description', { ns: 'templates' })} />;

  return (
    <>
      {header}
      <SegmentedControl
        mb="lg"
        data={meetingTypeOptions()}
        value={type}
        onChange={setType}
        aria-label={t('meetingTypeAria', { ns: 'templates' })}
      />
      {versions.isPending ? (
        <LoadingState />
      ) : versions.isError ? (
        <ErrorState error={versions.error} onRetry={() => void versions.refetch()} />
      ) : (
        <TypeEditor
          key={type}
          type={type}
          versions={versions.data}
          draft={drafts[type]}
          onLeave={keepDraft}
          onView={setViewing}
        />
      )}
      <Modal
        opened={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? t('history.viewTitle', { ns: 'templates', version: viewing.version }) : undefined}
        size="lg"
        centered
      >
        {viewing && (
          <TemplatePreview
            sections={viewing.sections}
            topicFields={viewing.topic_fields}
            meetingType={viewing.meeting_type}
          />
        )}
      </Modal>
    </>
  );
}
