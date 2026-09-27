import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Grid,
  Group,
  Paper,
  Pill,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCircleCheck,
  IconInfoCircle,
  IconMail,
  IconPlus,
  IconSend,
  IconUsers,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useDirectory,
  useEmailPreview,
  useLists,
  useMinutes,
  useRecipientDomains,
  useSendMinutes,
} from '../../api/queries';
import type { Meeting, Recipients } from '../../api/types';
import { PdfButton } from '../../components/PdfButton';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { domainList, inAllowedDomain, isEmail, normalizeEmail } from '../../lib/email';
import { formatDateTime } from '../../lib/format';
import { emailSubject, meetingTypeLabel } from '../../lib/meeting';
import { buildRecipients, listsForType } from '../../lib/recipients';

/** The longest email note the server takes (schemas.MAX_NOTE). */
const MAX_NOTE = 5000;
function RecipientPills({
  label,
  emails,
  nameOf,
  onRemove,
}: {
  label: string;
  emails: string[];
  nameOf: (email: string) => string;
  onRemove?: (email: string) => void;
}) {
  const { t } = useTranslation('meetings');
  return (
    <Stack gap={6}>
      <Text size="sm" fw={600}>
        {label} ({emails.length})
      </Text>
      {emails.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('sendTab.recipients.nobodyYet')}
        </Text>
      ) : (
        <Group gap={6}>
          {emails.map((email) => (
            <Pill
              key={email}
              size="md"
              withRemoveButton={Boolean(onRemove)}
              onRemove={() => onRemove?.(email)}
              removeButtonProps={{ 'aria-label': t('sendTab.recipients.removeAria', { email }) }}
              title={email}
            >
              {nameOf(email)}
            </Pill>
          ))}
        </Group>
      )}
    </Stack>
  );
}

/** Picks the recipients: distribution lists for the meeting type, colleagues (To) and other people (CC). */
function RecipientsForm({
  meeting,
  active,
  sending,
  onSend,
}: {
  meeting: Meeting;
  active: boolean;
  sending: boolean;
  /** note: the moderator's own email text, "" to send the default note. */
  onSend: (recipients: Recipients, note: string) => void;
}) {
  const { t } = useTranslation(['meetings', 'common']);
  const lists = useLists(active);
  const directory = useDirectory(active);
  const domains = useRecipientDomains(active);
  const minutes = useMinutes(meeting.id);
  const preview = useEmailPreview(meeting.id);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [extraTo, setExtraTo] = useState<string[]>([]);
  const [extraCc, setExtraCc] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [colleagueSearch, setColleagueSearch] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [ccError, setCcError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null); // null: the default note, as the preview shows it

  if (lists.isPending || directory.isPending || domains.isPending) return <LoadingState />;
  if (lists.isError) return <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />;
  if (directory.isError) return <ErrorState error={directory.error} onRetry={() => void directory.refetch()} />;
  if (domains.isError) return <ErrorState error={domains.error} onRetry={() => void domains.refetch()} />;

  const available = listsForType(lists.data, meeting.meeting_type);
  // Until the moderator changes the choice, the lists made for this meeting type are selected.
  const selectedIds =
    picked ?? available.filter((list) => list.meeting_type === meeting.meeting_type).map((list) => String(list.id));
  const selectedLists = available.filter((list) => selectedIds.includes(String(list.id)));

  // The people present at the meeting who have an account (an email in the directory) get the minutes: they are
  // in To from the start, like the lists; the moderator can still remove each one.
  const attendeeEmails = [
    ...new Set(
      (minutes.data?.attendees ?? [])
        .map((attendee) =>
          attendee.user_id !== null
            ? directory.data.find((person) => person.id === attendee.user_id)?.email
            : undefined,
        )
        .filter((email): email is string => Boolean(email))
        .map(normalizeEmail),
    ),
  ];
  const recipients = buildRecipients({
    lists: selectedLists,
    extraTo: [...attendeeEmails, ...extraTo],
    extraCc,
    excluded,
  });
  const outside = [...recipients.to, ...recipients.cc].filter((email) => !inAllowedDomain(email, domains.data));

  const names = new Map<string, string>();
  for (const list of lists.data) {
    for (const member of list.members) if (member.name) names.set(normalizeEmail(member.email), member.name);
  }
  for (const person of directory.data) names.set(normalizeEmail(person.email), person.full_name);
  const nameOf = (email: string) => {
    const name = names.get(email);
    return name ? `${name} <${email}>` : email;
  };

  const colleagues = directory.data
    .filter((person) => !recipients.to.includes(normalizeEmail(person.email)))
    .map((person) => ({
      value: normalizeEmail(person.email),
      label: person.position ? `${person.full_name} — ${person.position}` : person.full_name,
    }));

  // Attendees the moderator removed, to bring back with one click.
  const inRecipients = new Set([...recipients.to, ...recipients.cc]);
  const newAttendeeEmails = attendeeEmails.filter((email) => !inRecipients.has(email));

  const include = (email: string) => setExcluded((current) => current.filter((item) => item !== email));

  const addTo = (email: string) => {
    setExtraTo((current) => (current.includes(email) ? current : [...current, email]));
    include(email);
    setColleagueSearch('');
  };

  const addAttendees = () => newAttendeeEmails.forEach((email) => addTo(email));

  const addCc = () => {
    if (!isEmail(ccInput)) {
      setCcError(t('sendTab.cc.invalidEmail'));
      return;
    }
    if (!inAllowedDomain(ccInput, domains.data)) {
      setCcError(t('sendTab.cc.outsideDomain', { domains: domainList(domains.data) }));
      return;
    }
    const email = normalizeEmail(ccInput);
    setExtraCc((current) => (current.includes(email) ? current : [...current, email]));
    include(email);
    setCcInput('');
    setCcError(null);
  };

  const remove = (email: string) => {
    setExcluded((current) => [...current, email]);
    setExtraTo((current) => current.filter((item) => item !== email));
    setExtraCc((current) => current.filter((item) => item !== email));
  };

  const defaultNote = preview.data?.text.trim() ?? '';
  // Sent only when it says something else than the default note (which the server writes in the same words).
  const ownNote = note !== null && note.trim() !== defaultNote ? note.trim() : '';

  const confirmSend = () =>
    modals.openConfirmModal({
      title: t('sendTab.confirmSend.title'),
      centered: true,
      children: (
        <Text size="sm">
          {t('sendTab.confirmSend.body', { count: recipients.to.length, ccCount: recipients.cc.length })}
        </Text>
      ),
      labels: { confirm: t('sendTab.confirmSend.confirm'), cancel: t('common:action.cancel') },
      confirmProps: { leftSection: <IconSend size={16} /> },
      onConfirm: () => onSend(recipients, ownNote),
    });

  return (
    <Stack gap="lg">
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="lg" h="100%">
            <Stack gap="lg">
              <Stack gap="xs">
                <Title order={4}>{t('sendTab.lists.title')}</Title>
                {available.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    {t('sendTab.lists.empty', { type: meetingTypeLabel(meeting.meeting_type).toLowerCase() })}
                  </Text>
                ) : (
                  <Checkbox.Group value={selectedIds} onChange={setPicked} aria-label={t('sendTab.lists.title')}>
                    <Stack gap="xs">
                      {available.map((list) => {
                        const to = list.members.filter((member) => member.kind === 'to').length;
                        return (
                          <Checkbox
                            key={list.id}
                            value={String(list.id)}
                            label={list.name}
                            description={`${t('sendTab.lists.memberCounts', { to, cc: list.members.length - to })}${list.meeting_type ? '' : t('sendTab.lists.anyType')}`}
                          />
                        );
                      })}
                    </Stack>
                  </Checkbox.Group>
                )}
              </Stack>
              <Stack gap={4}>
                <Button
                  variant="default"
                  size="xs"
                  leftSection={<IconUsers size={14} />}
                  onClick={addAttendees}
                  disabled={newAttendeeEmails.length === 0}
                >
                  {t('sendTab.attendees.add')}
                </Button>
                <Text size="xs" c="dimmed">
                  {t('sendTab.attendees.hint')}
                </Text>
              </Stack>
              <Select
                label={t('sendTab.colleague.label')}
                placeholder={t('sendTab.colleague.placeholder')}
                data={colleagues}
                value={null}
                searchValue={colleagueSearch}
                onSearchChange={setColleagueSearch}
                onChange={(email) => email && addTo(email)}
                searchable
                selectFirstOptionOnChange
                selectFirstOptionOnDropdownOpen
                nothingFoundMessage={t('sendTab.colleague.nothingFound')}
              />
              <Stack gap={4}>
                <Group gap="xs" align="flex-start" wrap="nowrap">
                  <TextInput
                    label={t('sendTab.cc.label')}
                    placeholder={`name@${domains.data[0] ?? 'medpark.md'}`}
                    type="email"
                    value={ccInput}
                    error={ccError}
                    onChange={(event) => {
                      setCcInput(event.currentTarget.value);
                      setCcError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addCc();
                      }
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button variant="default" mt={25} leftSection={<IconPlus size={16} />} onClick={addCc}>
                    {t('common:action.add')}
                  </Button>
                </Group>
                {domains.data.length > 0 && (
                  <Text size="xs" c="dimmed">
                    {t('sendTab.cc.hint', { domains: domainList(domains.data) })}
                  </Text>
                )}
              </Stack>
            </Stack>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="lg" h="100%">
            <Stack gap="md" h="100%">
              <Title order={4}>{t('sendTab.recipients.title')}</Title>
              <RecipientPills
                label={t('sendTab.recipients.to')}
                emails={recipients.to}
                nameOf={nameOf}
                onRemove={remove}
              />
              <RecipientPills
                label={t('sendTab.recipients.cc')}
                emails={recipients.cc}
                nameOf={nameOf}
                onRemove={remove}
              />
              {outside.length > 0 && (
                <Alert color="orange" icon={<IconAlertTriangle />} title={t('sendTab.outsideAlert.title')}>
                  {t('sendTab.outsideAlert.body', { domains: domainList(domains.data), emails: outside.join(', ') })}
                </Alert>
              )}
              <Divider />
              <Group justify="space-between" gap="sm">
                <Text size="xs" c="dimmed" maw={300}>
                  {t('sendTab.footerNote')}
                </Text>
                <Button
                  leftSection={<IconSend size={16} />}
                  disabled={recipients.to.length === 0 || outside.length > 0}
                  loading={sending}
                  onClick={confirmSend}
                >
                  {t('sendTab.send')}
                </Button>
              </Group>
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>

      <Paper withBorder p="lg">
        <Stack gap="md">
          <Group justify="space-between" gap="sm">
            <Group gap="xs">
              <IconMail size={18} />
              <Title order={4}>{t('sendTab.emailPreview.title')}</Title>
            </Group>
            <PdfButton meetingId={meeting.id} size="xs" />
          </Group>
          <Stack gap={2}>
            <Text size="sm">
              <b>{t('sendTab.emailPreview.subject')}</b> {emailSubject(meeting, minutes.data?.title)}
            </Text>
            <Text size="sm">
              <b>{t('sendTab.emailPreview.to')}</b> {recipients.to.join(', ') || '—'}
            </Text>
            <Text size="sm">
              <b>{t('sendTab.emailPreview.cc')}</b> {recipients.cc.join(', ') || '—'}
            </Text>
            <Text size="sm">
              <b>{t('sendTab.emailPreview.attachment')}</b> {preview.data?.attachment ?? '—'}
            </Text>
          </Stack>
          <Divider />
          {preview.data ? (
            <Stack gap={6}>
              <Textarea
                label={t('sendTab.emailPreview.message')}
                description={t('sendTab.emailPreview.messageDescription')}
                autosize
                minRows={5}
                maxRows={14}
                maxLength={MAX_NOTE}
                value={note ?? defaultNote}
                onChange={(event) => setNote(event.currentTarget.value)}
                disabled={sending}
              />
              {ownNote && (
                <Group justify="flex-end">
                  <Button
                    variant="subtle"
                    size="xs"
                    leftSection={<IconArrowBackUp size={14} />}
                    onClick={() => setNote(null)}
                  >
                    {t('sendTab.emailPreview.restoreDefault')}
                  </Button>
                </Group>
              )}
            </Stack>
          ) : (
            <LoadingState />
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

function SentSummary({ meeting, recipients }: { meeting: Meeting; recipients?: Recipients | null }) {
  const { t } = useTranslation('meetings');
  return (
    <Stack gap="md">
      <Alert color="green" icon={<IconCircleCheck />} title={t('sendTab.sent.title')}>
        {t('sendTab.sent.body', { date: formatDateTime(meeting.sent_at) })}
      </Alert>
      {recipients && (
        <Paper withBorder p="lg">
          <Stack gap="md">
            <RecipientPills label={t('sendTab.recipients.to')} emails={recipients.to} nameOf={(email) => email} />
            <RecipientPills label={t('sendTab.recipients.cc')} emails={recipients.cc} nameOf={(email) => email} />
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

/** Last step: recipients and sending, once the minutes are approved. */
export function SendTab({ meeting, active }: { meeting: Meeting; active: boolean }) {
  const { t } = useTranslation('meetings');
  const send = useSendMinutes(meeting.id);
  if (meeting.status === 'sent')
    return <SentSummary meeting={meeting} recipients={meeting.recipients ?? send.variables?.recipients} />;
  if (meeting.status !== 'approved') {
    return (
      <Alert color="blue" icon={<IconInfoCircle />} title={t('sendTab.approveFirst.title')}>
        {t('sendTab.approveFirst.body')}
      </Alert>
    );
  }
  return (
    <RecipientsForm
      meeting={meeting}
      active={active}
      sending={send.isPending}
      onSend={(recipients, note) => send.mutate({ recipients, note })}
    />
  );
}
