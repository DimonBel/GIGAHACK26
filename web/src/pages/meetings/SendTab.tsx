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
  TextInput,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconMail, IconPlus, IconSend } from '@tabler/icons-react';
import { useState } from 'react';

import { useDirectory, useLists, useMinutes, useRecipientDomains, useSendMinutes } from '../../api/queries';
import type { Meeting, Recipients } from '../../api/types';
import { MinutesView } from '../../components/MinutesView';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { domainList, inAllowedDomain, isEmail, normalizeEmail } from '../../lib/email';
import { formatDateTime } from '../../lib/format';
import { emailSubject, meetingTypeLabel } from '../../lib/meeting';
import { buildRecipients, listsForType } from '../../lib/recipients';

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
  return (
    <Stack gap={6}>
      <Text size="sm" fw={600}>
        {label} ({emails.length})
      </Text>
      {emails.length === 0 ? (
        <Text size="sm" c="dimmed">
          Nobody yet.
        </Text>
      ) : (
        <Group gap={6}>
          {emails.map((email) => (
            <Pill
              key={email}
              size="md"
              withRemoveButton={Boolean(onRemove)}
              onRemove={() => onRemove?.(email)}
              removeButtonProps={{ 'aria-label': `Remove ${email}` }}
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
  onSend: (recipients: Recipients) => void;
}) {
  const lists = useLists(active);
  const directory = useDirectory(active);
  const domains = useRecipientDomains(active);
  const minutes = useMinutes(meeting.id);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [extraTo, setExtraTo] = useState<string[]>([]);
  const [extraCc, setExtraCc] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [colleagueSearch, setColleagueSearch] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [ccError, setCcError] = useState<string | null>(null);

  if (lists.isPending || directory.isPending || domains.isPending) return <LoadingState />;
  if (lists.isError) return <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />;
  if (directory.isError) return <ErrorState error={directory.error} onRetry={() => void directory.refetch()} />;
  if (domains.isError) return <ErrorState error={domains.error} onRetry={() => void domains.refetch()} />;

  const available = listsForType(lists.data, meeting.meeting_type);
  // Until the moderator changes the choice, the lists made for this meeting type are selected.
  const selectedIds =
    picked ?? available.filter((list) => list.meeting_type === meeting.meeting_type).map((list) => String(list.id));
  const selectedLists = available.filter((list) => selectedIds.includes(String(list.id)));
  const recipients = buildRecipients({ lists: selectedLists, extraTo, extraCc, excluded });
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

  const include = (email: string) => setExcluded((current) => current.filter((item) => item !== email));

  const addTo = (email: string) => {
    setExtraTo((current) => (current.includes(email) ? current : [...current, email]));
    include(email);
    setColleagueSearch('');
  };

  const addCc = () => {
    if (!isEmail(ccInput)) {
      setCcError('Enter a valid email address');
      return;
    }
    if (!inAllowedDomain(ccInput, domains.data)) {
      setCcError(`Only addresses at ${domainList(domains.data)}`);
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

  const confirmSend = () =>
    modals.openConfirmModal({
      title: 'Send the minutes?',
      centered: true,
      children: (
        <Text size="sm">
          The approved minutes go to {recipients.to.length} recipient(s) in To and {recipients.cc.length} in CC, through
          the hospital&apos;s own mail server.
        </Text>
      ),
      labels: { confirm: 'Send', cancel: 'Cancel' },
      confirmProps: { leftSection: <IconSend size={16} /> },
      onConfirm: () => onSend(recipients),
    });

  return (
    <Stack gap="lg">
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="lg" h="100%">
            <Stack gap="lg">
              <Stack gap="xs">
                <Title order={4}>Distribution lists</Title>
                {available.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No distribution list for {meetingTypeLabel(meeting.meeting_type).toLowerCase()} meetings. An
                    administrator can create one.
                  </Text>
                ) : (
                  <Checkbox.Group value={selectedIds} onChange={setPicked} aria-label="Distribution lists">
                    <Stack gap="xs">
                      {available.map((list) => {
                        const to = list.members.filter((member) => member.kind === 'to').length;
                        return (
                          <Checkbox
                            key={list.id}
                            value={String(list.id)}
                            label={list.name}
                            description={`${to} in To · ${list.members.length - to} in CC${list.meeting_type ? '' : ' · for any meeting type'}`}
                          />
                        );
                      })}
                    </Stack>
                  </Checkbox.Group>
                )}
              </Stack>
              <Select
                label="Add a colleague (To)"
                placeholder="Search by name or position"
                data={colleagues}
                value={null}
                searchValue={colleagueSearch}
                onSearchChange={setColleagueSearch}
                onChange={(email) => email && addTo(email)}
                searchable
                selectFirstOptionOnChange
                selectFirstOptionOnDropdownOpen
                nothingFoundMessage="Nobody found"
              />
              <Stack gap={4}>
                <Group gap="xs" align="flex-start" wrap="nowrap">
                  <TextInput
                    label="Add another person (CC)"
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
                    Add
                  </Button>
                </Group>
                {domains.data.length > 0 && (
                  <Text size="xs" c="dimmed">
                    Minutes can only be sent to addresses at {domainList(domains.data)}.
                  </Text>
                )}
              </Stack>
            </Stack>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Paper withBorder p="lg" h="100%">
            <Stack gap="md" h="100%">
              <Title order={4}>Recipients</Title>
              <RecipientPills label="To" emails={recipients.to} nameOf={nameOf} onRemove={remove} />
              <RecipientPills label="CC" emails={recipients.cc} nameOf={nameOf} onRemove={remove} />
              {outside.length > 0 && (
                <Alert color="orange" icon={<IconAlertTriangle />} title="Outside the allowed domains">
                  Minutes can only go to {domainList(domains.data)}. Remove {outside.join(', ')} to send.
                </Alert>
              )}
              <Divider />
              <Group justify="space-between" gap="sm">
                <Text size="xs" c="dimmed" maw={300}>
                  Delivered by the hospital&apos;s own mail server. Nothing leaves the network.
                </Text>
                <Button
                  leftSection={<IconSend size={16} />}
                  disabled={recipients.to.length === 0 || outside.length > 0}
                  loading={sending}
                  onClick={confirmSend}
                >
                  Send minutes
                </Button>
              </Group>
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>

      <Paper withBorder p="lg">
        <Stack gap="md">
          <Group gap="xs">
            <IconMail size={18} />
            <Title order={4}>Email preview</Title>
          </Group>
          <Stack gap={2}>
            <Text size="sm">
              <b>Subject:</b> {emailSubject(meeting, minutes.data?.title)}
            </Text>
            <Text size="sm">
              <b>To:</b> {recipients.to.join(', ') || '—'}
            </Text>
            <Text size="sm">
              <b>CC:</b> {recipients.cc.join(', ') || '—'}
            </Text>
          </Stack>
          <Divider />
          {minutes.data ? <MinutesView minutes={minutes.data} meetingType={meeting.meeting_type} /> : <LoadingState />}
        </Stack>
      </Paper>
    </Stack>
  );
}

function SentSummary({ meeting, recipients }: { meeting: Meeting; recipients?: Recipients | null }) {
  return (
    <Stack gap="md">
      <Alert color="green" icon={<IconCircleCheck />} title="Minutes sent">
        Sent on {formatDateTime(meeting.sent_at)} through the hospital&apos;s own mail server.
      </Alert>
      {recipients && (
        <Paper withBorder p="lg">
          <Stack gap="md">
            <RecipientPills label="To" emails={recipients.to} nameOf={(email) => email} />
            <RecipientPills label="CC" emails={recipients.cc} nameOf={(email) => email} />
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

/** Last step: recipients and sending, once the minutes are approved. */
export function SendTab({ meeting, active }: { meeting: Meeting; active: boolean }) {
  const send = useSendMinutes(meeting.id);
  if (meeting.status === 'sent')
    return <SentSummary meeting={meeting} recipients={meeting.recipients ?? send.variables} />;
  if (meeting.status !== 'approved') {
    return (
      <Alert color="blue" icon={<IconInfoCircle />} title="Approve the minutes first">
        Review the draft on the Minutes tab and click “I agree”. Then choose the recipients here.
      </Alert>
    );
  }
  return (
    <RecipientsForm
      meeting={meeting}
      active={active}
      sending={send.isPending}
      onSend={(recipients) => send.mutate(recipients)}
    />
  );
}
