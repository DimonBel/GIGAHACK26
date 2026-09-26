import {
  ActionIcon,
  Badge,
  Button,
  Card,
  EmptyState,
  Group,
  Modal,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { IconAddressBook, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import { useDeleteList, useDirectory, useLists, useRecipientDomains, useSaveList } from '../../api/queries';
import type { DirectoryEntry, DistributionList, ListMember, MeetingType, RecipientKind } from '../../api/types';
import { MeetingTypeBadge } from '../../components/Badges';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { domainList, inAllowedDomain, isEmail, normalizeEmail } from '../../lib/email';
import { MEETING_TYPES } from '../../lib/meeting';
import { notifySuccess } from '../../lib/notify';

const ANY_TYPE = 'any';
const KIND_OPTIONS: { value: RecipientKind; label: string }[] = [
  { value: 'to', label: 'To' },
  { value: 'cc', label: 'CC' },
];
const TYPE_OPTIONS = [...MEETING_TYPES, { value: ANY_TYPE, label: 'Any meeting type' }];
const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  ...TYPE_OPTIONS.map(({ value, label }) => ({
    value,
    label: value === ANY_TYPE ? 'Any type' : label,
  })),
];
const PREVIEW_MEMBERS = 6;

interface ListFormValues {
  name: string;
  meetingType: MeetingType | typeof ANY_TYPE;
  members: ListMember[];
}

function TypeBadge({ type }: { type: MeetingType | null }) {
  return type ? (
    <MeetingTypeBadge type={type} />
  ) : (
    <Badge color="gray" variant="outline">
      Any type
    </Badge>
  );
}

/** A list's name, meeting type and members. Not a <form>: Enter in the pickers adds a member, it never saves. */
function ListForm({
  list,
  directory,
  domains,
  onDone,
}: {
  list?: DistributionList;
  directory: DirectoryEntry[];
  /** Where minutes may be sent (empty: any domain). */
  domains: string[];
  onDone: () => void;
}) {
  const save = useSaveList();
  const [personSearch, setPersonSearch] = useState('');
  const [personKind, setPersonKind] = useState<RecipientKind>('to');
  const [external, setExternal] = useState('');
  const [externalKind, setExternalKind] = useState<RecipientKind>('cc');
  const [externalError, setExternalError] = useState<string | null>(null);
  const form = useForm<ListFormValues>({
    mode: 'controlled',
    initialValues: {
      name: list?.name ?? '',
      meetingType: list?.meeting_type ?? ANY_TYPE,
      members: list?.members ?? [],
    },
    validate: { name: (value) => (value.trim() ? null : 'Enter a name') },
  });
  const members = form.values.members;
  const listed = new Set(members.map((member) => normalizeEmail(member.email)));
  const people = directory
    .filter((entry) => !listed.has(normalizeEmail(entry.email)))
    .map((entry) => ({
      value: String(entry.id),
      label: `${entry.full_name}${entry.position ? ` — ${entry.position}` : ''}`,
    }));

  const addPerson = (id: string | null) => {
    const entry = directory.find((candidate) => String(candidate.id) === id);
    if (!entry) return;
    form.insertListItem('members', { user_id: entry.id, email: entry.email, name: entry.full_name, kind: personKind });
    setPersonSearch('');
  };

  const addExternal = () => {
    const email = normalizeEmail(external);
    if (!isEmail(email)) {
      setExternalError('Enter a valid email address');
      return;
    }
    if (!inAllowedDomain(email, domains)) {
      setExternalError(`Only addresses at ${domainList(domains)}`);
      return;
    }
    if (listed.has(email)) {
      setExternalError('Already on the list');
      return;
    }
    form.insertListItem('members', { user_id: null, email, name: '', kind: externalKind });
    setExternal('');
    setExternalError(null);
  };

  const submit = form.onSubmit((values) => {
    const input = {
      name: values.name.trim(),
      meeting_type: values.meetingType === ANY_TYPE ? null : values.meetingType,
      members: values.members.map((member) =>
        member.user_id === null
          ? { email: member.email, kind: member.kind }
          : { user_id: member.user_id, kind: member.kind },
      ),
    };
    save.mutate(
      { id: list?.id, input },
      {
        onSuccess: () => {
          notifySuccess(list ? 'List saved.' : 'List created.');
          onDone();
        },
      },
    );
  });

  return (
    <Stack>
      <TextInput label="Name" placeholder="e.g. Medical board" required {...form.getInputProps('name')} />
      <Select
        label="Meeting type"
        description="The list is offered when sending minutes of this type."
        data={TYPE_OPTIONS}
        allowDeselect={false}
        {...form.getInputProps('meetingType')}
      />

      <Stack gap={6}>
        <Text size="sm" fw={500}>
          Add a colleague
        </Text>
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <SegmentedControl
            data={KIND_OPTIONS}
            value={personKind}
            onChange={setPersonKind}
            aria-label="Colleague receives as"
          />
          <Select
            placeholder="Search the directory"
            data={people}
            value={null}
            onChange={addPerson}
            searchValue={personSearch}
            onSearchChange={setPersonSearch}
            searchable
            selectFirstOptionOnChange
            selectFirstOptionOnDropdownOpen
            nothingFoundMessage="Nobody found"
            aria-label="Colleague"
            style={{ flex: 1 }}
          />
        </Group>
      </Stack>

      <Stack gap={6}>
        <div>
          <Text size="sm" fw={500}>
            Add another address
          </Text>
          <Text size="xs" c="dimmed">
            {domains.length > 0 ? `At ${domainList(domains)} (the allowed recipient domains).` : 'Any domain.'}
          </Text>
        </div>
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <SegmentedControl
            data={KIND_OPTIONS}
            value={externalKind}
            onChange={setExternalKind}
            aria-label="Address receives as"
          />
          <TextInput
            placeholder={`quality@${domains[0] ?? 'medpark.md'}`}
            type="email"
            value={external}
            error={externalError}
            onChange={(event) => {
              setExternal(event.currentTarget.value);
              setExternalError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addExternal();
            }}
            aria-label="Email address"
            style={{ flex: 1 }}
          />
          <ActionIcon size={36} variant="default" aria-label="Add the address" onClick={addExternal}>
            <IconPlus size={18} />
          </ActionIcon>
        </Group>
      </Stack>

      {members.length === 0 ? (
        <Text size="sm" c="dimmed">
          No members yet.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={420}>
          <Table verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Member</Table.Th>
                <Table.Th w={110}>Receives as</Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {members.map((member, index) => (
                <Table.Tr key={member.email}>
                  <Table.Td>
                    <Text size="sm">{member.name || member.email}</Text>
                    {member.name && (
                      <Text size="xs" c="dimmed">
                        {member.email}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <SegmentedControl
                      size="xs"
                      data={KIND_OPTIONS}
                      value={member.kind}
                      onChange={(value) => form.setFieldValue(`members.${index}.kind`, value)}
                      aria-label={`${member.email} receives as`}
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={`Remove ${member.email}`}
                      onClick={() => form.removeListItem('members', index)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Group justify="flex-end" mt="sm">
        <Button variant="default" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={() => submit()} loading={save.isPending}>
          {list ? 'Save' : 'Create list'}
        </Button>
      </Group>
    </Stack>
  );
}

function ListCard({ list, onEdit, onDelete }: { list: DistributionList; onEdit: () => void; onDelete: () => void }) {
  const to = list.members.filter((member) => member.kind === 'to');
  const cc = list.members.filter((member) => member.kind === 'cc');
  const preview = list.members.slice(0, PREVIEW_MEMBERS);
  return (
    <Card withBorder padding="lg">
      <Stack gap="sm" h="100%">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text fw={700}>{list.name}</Text>
          <TypeBadge type={list.meeting_type} />
        </Group>
        <Text size="sm" c="dimmed">
          {to.length} in To · {cc.length} in CC
        </Text>
        <Stack gap={2} style={{ flex: 1 }}>
          {preview.map((member) => (
            <Group key={member.email} gap={6} wrap="nowrap">
              <Badge size="xs" variant="light" color={member.kind === 'to' ? 'teal' : 'gray'} w={32}>
                {member.kind}
              </Badge>
              <Text size="sm" truncate>
                {member.name || member.email}
              </Text>
            </Group>
          ))}
          {list.members.length > PREVIEW_MEMBERS && (
            <Text size="xs" c="dimmed">
              and {list.members.length - PREVIEW_MEMBERS} more
            </Text>
          )}
        </Stack>
        <Group gap="xs" justify="flex-end">
          <Button variant="default" size="xs" leftSection={<IconEdit size={14} />} onClick={onEdit}>
            Edit
          </Button>
          <Button variant="subtle" color="red" size="xs" leftSection={<IconTrash size={14} />} onClick={onDelete}>
            Delete
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export function ListsPage() {
  const lists = useLists();
  const directory = useDirectory();
  const domains = useRecipientDomains();
  const remove = useDeleteList();
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<DistributionList | 'new' | null>(null);
  const close = () => setEditing(null);

  const confirmDelete = (list: DistributionList) =>
    modals.openConfirmModal({
      title: `Delete “${list.name}”?`,
      centered: true,
      children: <Text size="sm">Moderators will no longer be offered this list. Sent minutes are not affected.</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(list.id, { onSuccess: () => notifySuccess('List deleted.') }),
    });

  const header = (
    <PageHeader
      title="Distribution lists"
      description="Who receives the minutes of each meeting type. Moderators can add more people when sending."
      actions={
        <Button leftSection={<IconPlus size={18} />} onClick={() => setEditing('new')}>
          New list
        </Button>
      }
    />
  );

  if (lists.isPending || directory.isPending || domains.isPending)
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  if (lists.isError)
    return (
      <>
        {header}
        <ErrorState error={lists.error} onRetry={() => void lists.refetch()} />
      </>
    );
  if (directory.isError) {
    return (
      <>
        {header}
        <ErrorState error={directory.error} onRetry={() => void directory.refetch()} />
      </>
    );
  }
  if (domains.isError) {
    return (
      <>
        {header}
        <ErrorState error={domains.error} onRetry={() => void domains.refetch()} />
      </>
    );
  }

  const shown = lists.data.filter((list) => filter === 'all' || (list.meeting_type ?? ANY_TYPE) === filter);

  return (
    <>
      {header}
      <SegmentedControl mb="md" data={FILTER_OPTIONS} value={filter} onChange={setFilter} aria-label="Meeting type" />
      {shown.length === 0 ? (
        <EmptyState
          mt="xl"
          icon={<IconAddressBook />}
          title="No distribution lists"
          description="Create a list per meeting type, e.g. the medical board for medical meetings."
        />
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {shown.map((list) => (
            <ListCard key={list.id} list={list} onEdit={() => setEditing(list)} onDelete={() => confirmDelete(list)} />
          ))}
        </SimpleGrid>
      )}
      <Modal
        opened={editing !== null}
        onClose={close}
        title={editing === 'new' ? 'New distribution list' : 'Edit distribution list'}
        size="lg"
        centered
      >
        {editing !== null && (
          <ListForm
            list={editing === 'new' ? undefined : editing}
            directory={directory.data}
            domains={domains.data}
            onDone={close}
          />
        )}
      </Modal>
    </>
  );
}
