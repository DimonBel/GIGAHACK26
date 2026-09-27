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
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useDeleteList, useDirectory, useLists, useRecipientDomains, useSaveList } from '../../api/queries';
import type { DirectoryEntry, DistributionList, ListMember, MeetingType, RecipientKind } from '../../api/types';
import { MeetingTypeBadge } from '../../components/Badges';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { TablePagination } from '../../components/TablePagination';
import { usePaged } from '../../hooks/usePaged';
import { domainList, inAllowedDomain, isEmail, normalizeEmail } from '../../lib/email';
import { meetingTypeOptions } from '../../lib/meeting';
import { notifySuccess } from '../../lib/notify';

const ANY_TYPE = 'any';
type Translate = TFunction<['admin', 'common']>;

const kindOptions = (t: Translate): { value: RecipientKind; label: string }[] => [
  { value: 'to', label: t('lists.kindTo', { ns: 'admin' }) },
  { value: 'cc', label: t('lists.kindCc', { ns: 'admin' }) },
];

const kindLabel = (t: Translate, kind: RecipientKind): string =>
  kindOptions(t).find((option) => option.value === kind)?.label ?? kind;

const typeOptions = (t: Translate) => [
  ...meetingTypeOptions(),
  { value: ANY_TYPE, label: t('lists.anyMeetingType', { ns: 'admin' }) },
];

const filterOptions = (t: Translate) => [
  { value: 'all', label: t('lists.filterAll', { ns: 'admin' }) },
  ...typeOptions(t).map(({ value, label }) => ({
    value,
    label: value === ANY_TYPE ? t('lists.anyType', { ns: 'admin' }) : label,
  })),
];
const PREVIEW_MEMBERS = 6;

interface ListFormValues {
  name: string;
  meetingType: MeetingType | typeof ANY_TYPE;
  members: ListMember[];
}

/** "Vice president · Doctor · Neurologist": job title, position and specialty, skipping empty ones. */
function personDetail(person: Pick<DirectoryEntry, 'job_title' | 'position' | 'specialty'>): string {
  return [person.job_title, person.position, person.specialty].filter(Boolean).join(' · ');
}

function TypeBadge({ type }: { type: MeetingType | null }) {
  const { t } = useTranslation(['admin', 'common']);
  return type ? (
    <MeetingTypeBadge type={type} />
  ) : (
    <Badge color="gray" variant="outline">
      {t('lists.anyType', { ns: 'admin' })}
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
  const { t } = useTranslation(['admin', 'common']);
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
    validate: { name: (value) => (value.trim() ? null : t('lists.form.nameRequired', { ns: 'admin' })) },
  });
  const members = form.values.members;
  const listed = new Set(members.map((member) => normalizeEmail(member.email)));
  const people = directory
    .filter((entry) => !listed.has(normalizeEmail(entry.email)))
    .map((entry) => {
      const detail = personDetail(entry);
      return { value: String(entry.id), label: detail ? `${entry.full_name} — ${detail}` : entry.full_name };
    });

  const addPerson = (id: string | null) => {
    const entry = directory.find((candidate) => String(candidate.id) === id);
    if (!entry) return;
    form.insertListItem('members', { user_id: entry.id, email: entry.email, name: entry.full_name, kind: personKind });
    setPersonSearch('');
  };

  const addExternal = () => {
    const email = normalizeEmail(external);
    if (!isEmail(email)) {
      setExternalError(t('validation.email', { ns: 'admin' }));
      return;
    }
    if (!inAllowedDomain(email, domains)) {
      setExternalError(t('lists.form.onlyDomains', { ns: 'admin', domains: domainList(domains) }));
      return;
    }
    if (listed.has(email)) {
      setExternalError(t('lists.form.alreadyListed', { ns: 'admin' }));
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
          notifySuccess(list ? t('lists.notify.saved', { ns: 'admin' }) : t('lists.notify.created', { ns: 'admin' }));
          onDone();
        },
      },
    );
  });

  return (
    <Stack>
      <TextInput
        label={t('lists.form.name', { ns: 'admin' })}
        placeholder={t('lists.form.namePlaceholder', { ns: 'admin' })}
        required
        {...form.getInputProps('name')}
      />
      <Select
        label={t('lists.meetingTypeFilterAria', { ns: 'admin' })}
        description={t('lists.form.meetingTypeDescription', { ns: 'admin' })}
        data={typeOptions(t)}
        allowDeselect={false}
        {...form.getInputProps('meetingType')}
      />

      <Stack gap={6}>
        <Text size="sm" fw={500}>
          {t('lists.form.addColleague', { ns: 'admin' })}
        </Text>
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <SegmentedControl
            data={kindOptions(t)}
            value={personKind}
            onChange={setPersonKind}
            aria-label={t('lists.form.colleagueKindAria', { ns: 'admin' })}
          />
          <Select
            placeholder={t('lists.form.searchDirectory', { ns: 'admin' })}
            data={people}
            value={null}
            onChange={addPerson}
            searchValue={personSearch}
            onSearchChange={setPersonSearch}
            searchable
            selectFirstOptionOnChange
            selectFirstOptionOnDropdownOpen
            nothingFoundMessage={t('lists.form.nobodyFound', { ns: 'admin' })}
            aria-label={t('lists.form.colleagueAria', { ns: 'admin' })}
            style={{ flex: 1 }}
          />
        </Group>
      </Stack>

      <Stack gap={6}>
        <div>
          <Text size="sm" fw={500}>
            {t('lists.form.addAnother', { ns: 'admin' })}
          </Text>
          <Text size="xs" c="dimmed">
            {domains.length > 0
              ? t('lists.form.domainsHint', { ns: 'admin', domains: domainList(domains) })
              : t('lists.form.anyDomain', { ns: 'admin' })}
          </Text>
        </div>
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <SegmentedControl
            data={kindOptions(t)}
            value={externalKind}
            onChange={setExternalKind}
            aria-label={t('lists.form.addressKindAria', { ns: 'admin' })}
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
            aria-label={t('lists.form.emailAria', { ns: 'admin' })}
            style={{ flex: 1 }}
          />
          <ActionIcon
            size={36}
            variant="default"
            aria-label={t('lists.form.addAddress', { ns: 'admin' })}
            onClick={addExternal}
          >
            <IconPlus size={18} />
          </ActionIcon>
        </Group>
      </Stack>

      {members.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('lists.form.noMembers', { ns: 'admin' })}
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={420}>
          <Table verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('lists.form.memberHeader', { ns: 'admin' })}</Table.Th>
                <Table.Th w={110}>{t('lists.form.receivesAsHeader', { ns: 'admin' })}</Table.Th>
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
                      data={kindOptions(t)}
                      value={member.kind}
                      onChange={(value) => form.setFieldValue(`members.${index}.kind`, value)}
                      aria-label={t('lists.form.receivesAsAria', { ns: 'admin', email: member.email })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={t('lists.form.removeMemberAria', { ns: 'admin', email: member.email })}
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
          {t('common:action.cancel')}
        </Button>
        <Button onClick={() => submit()} loading={save.isPending}>
          {list ? t('common:action.save') : t('lists.createList', { ns: 'admin' })}
        </Button>
      </Group>
    </Stack>
  );
}

function ListCard({ list, onEdit, onDelete }: { list: DistributionList; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation(['admin', 'common']);
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
          {t('lists.card.counts', { ns: 'admin', to: to.length, cc: cc.length })}
        </Text>
        <Stack gap={2} style={{ flex: 1 }}>
          {preview.map((member) => (
            <Group key={member.email} gap={6} wrap="nowrap">
              <Badge size="xs" variant="light" color={member.kind === 'to' ? 'teal' : 'gray'} w={32}>
                {kindLabel(t, member.kind)}
              </Badge>
              <Text size="sm" truncate>
                {member.name || member.email}
              </Text>
            </Group>
          ))}
          {list.members.length > PREVIEW_MEMBERS && (
            <Text size="xs" c="dimmed">
              {t('lists.card.moreMembers', { ns: 'admin', count: list.members.length - PREVIEW_MEMBERS })}
            </Text>
          )}
        </Stack>
        <Group gap="xs" justify="flex-end">
          <Button variant="default" size="xs" leftSection={<IconEdit size={14} />} onClick={onEdit}>
            {t('common:action.edit')}
          </Button>
          <Button variant="subtle" color="red" size="xs" leftSection={<IconTrash size={14} />} onClick={onDelete}>
            {t('common:action.delete')}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export function ListsPage() {
  const { t } = useTranslation(['admin', 'common']);
  const lists = useLists();
  const directory = useDirectory();
  const domains = useRecipientDomains();
  const remove = useDeleteList();
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<DistributionList | 'new' | null>(null);
  const close = () => setEditing(null);

  const confirmDelete = (list: DistributionList) =>
    modals.openConfirmModal({
      title: t('lists.deleteConfirm.title', { ns: 'admin', name: list.name }),
      centered: true,
      children: <Text size="sm">{t('lists.deleteConfirm.body', { ns: 'admin' })}</Text>,
      labels: { confirm: t('common:action.delete'), cancel: t('common:action.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        remove.mutate(list.id, { onSuccess: () => notifySuccess(t('lists.notify.deleted', { ns: 'admin' })) }),
    });

  const header = (
    <PageHeader
      title={t('common:nav.lists')}
      description={t('lists.description', { ns: 'admin' })}
      actions={
        <Button leftSection={<IconPlus size={18} />} onClick={() => setEditing('new')}>
          {t('lists.newList', { ns: 'admin' })}
        </Button>
      }
    />
  );

  const shown = (lists.data ?? []).filter((list) => filter === 'all' || (list.meeting_type ?? ANY_TYPE) === filter);
  const paged = usePaged(shown);

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

  return (
    <>
      {header}
      <SegmentedControl
        mb="md"
        data={filterOptions(t)}
        value={filter}
        onChange={setFilter}
        aria-label={t('lists.meetingTypeFilterAria', { ns: 'admin' })}
      />
      {shown.length === 0 ? (
        <EmptyState
          mt="xl"
          icon={<IconAddressBook />}
          title={t('lists.emptyTitle', { ns: 'admin' })}
          description={t('lists.emptyDescription', { ns: 'admin' })}
        />
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {paged.items.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                onEdit={() => setEditing(list)}
                onDelete={() => confirmDelete(list)}
              />
            ))}
          </SimpleGrid>
          <TablePagination paged={paged} />
        </>
      )}
      <Modal
        opened={editing !== null}
        onClose={close}
        title={editing === 'new' ? t('lists.newListTitle', { ns: 'admin' }) : t('lists.editListTitle', { ns: 'admin' })}
        size="lg"
        centered
      >
        {editing !== null && directory.data && domains.data && (
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
