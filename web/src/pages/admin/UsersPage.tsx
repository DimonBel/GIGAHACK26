import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  PasswordInput,
  type PasswordInputProps,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { IconEdit, IconKey, IconSearch, IconUserCheck, IconUserOff, IconUserPlus, IconWand } from '@tabler/icons-react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useCreateUser, useDeactivateUser, useUpdateUser, useUsers } from '../../api/queries';
import type { User } from '../../api/types';
import { useUser } from '../../auth/context';
import { RoleBadge } from '../../components/Badges';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { TablePagination } from '../../components/TablePagination';
import { usePaged } from '../../hooks/usePaged';
import { isEmail } from '../../lib/email';
import { formatDateTime } from '../../lib/format';
import { notifySuccess } from '../../lib/notify';
import { roleDescription, roleLabel, ROLE_VALUES } from '../../lib/roles';
import { matchesQuery } from '../../lib/search';

const MIN_PASSWORD_LENGTH = 12;
const GENERATED_PASSWORD_LENGTH = 16;
// No look-alike characters (0/O, 1/l/I), so a generated password can be read out or typed.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.';
const roleOptions = () => ROLE_VALUES.map((value) => ({ value, label: roleLabel(value) }));

type Dialog = { kind: 'create' } | { kind: 'edit'; user: User } | { kind: 'password'; user: User };

function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(GENERATED_PASSWORD_LENGTH));
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('');
}

/** "Vice president · Doctor · Neurologist": job title, position and specialty, skipping empty ones. */
function personDetail(person: Pick<User, 'job_title' | 'position' | 'specialty'>): string {
  return [person.job_title, person.position, person.specialty].filter(Boolean).join(' · ');
}

/** Password input with a generator; a generated password is shown so it can be handed over. */
function PasswordField({ onGenerate, ...inputProps }: PasswordInputProps & { onGenerate: () => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const [visible, setVisible] = useState(false);
  return (
    <Stack gap={4}>
      <PasswordInput
        {...inputProps}
        description={t('users.form.passwordHint', { ns: 'admin', min: MIN_PASSWORD_LENGTH })}
        autoComplete="new-password"
        visible={visible}
        onVisibilityChange={setVisible}
        required
      />
      <Button
        variant="subtle"
        size="compact-xs"
        w="fit-content"
        leftSection={<IconWand size={14} />}
        onClick={() => {
          onGenerate();
          setVisible(true);
        }}
      >
        {t('users.form.generatePassword', { ns: 'admin' })}
      </Button>
    </Stack>
  );
}

function UserForm({ user, onDone }: { user?: User; onDone: () => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const create = useCreateUser();
  const update = useUpdateUser();
  const form = useForm({
    mode: 'controlled',
    initialValues: {
      email: user?.email ?? '',
      full_name: user?.full_name ?? '',
      position: user?.position ?? '',
      specialty: user?.specialty ?? '',
      job_title: user?.job_title ?? '',
      role: user?.role ?? 'user',
      password: '',
    },
    validate: {
      email: (value) => (user || isEmail(value) ? null : t('validation.email', { ns: 'admin' })),
      full_name: (value) => (value.trim() ? null : t('users.form.fullNameRequired', { ns: 'admin' })),
      password: (value) =>
        user || value.length >= MIN_PASSWORD_LENGTH
          ? null
          : t('users.form.passwordTooShort', { ns: 'admin', min: MIN_PASSWORD_LENGTH }),
    },
  });

  const submit = form.onSubmit(({ email, full_name, position, specialty, job_title, role, password }) => {
    const details = {
      full_name: full_name.trim(),
      position: position.trim(),
      specialty: specialty.trim(),
      job_title: job_title.trim(),
      role,
    };
    const onSuccess = () => {
      notifySuccess(user ? t('users.notify.updated', { ns: 'admin' }) : t('users.notify.created', { ns: 'admin' }));
      onDone();
    };
    if (user) update.mutate({ id: user.id, input: details }, { onSuccess });
    else create.mutate({ ...details, email: email.trim(), password }, { onSuccess });
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack>
        <TextInput
          label={t('users.form.email', { ns: 'admin' })}
          type="email"
          required
          disabled={Boolean(user)}
          {...form.getInputProps('email')}
        />
        <TextInput label={t('users.form.fullName', { ns: 'admin' })} required {...form.getInputProps('full_name')} />
        <TextInput
          label={t('users.form.jobTitle', { ns: 'admin' })}
          placeholder={t('users.form.jobTitlePlaceholder', { ns: 'admin' })}
          {...form.getInputProps('job_title')}
        />
        <TextInput
          label={t('users.form.position', { ns: 'admin' })}
          placeholder={t('users.form.positionPlaceholder', { ns: 'admin' })}
          {...form.getInputProps('position')}
        />
        <TextInput
          label={t('users.form.specialty', { ns: 'admin' })}
          placeholder={t('users.form.specialtyPlaceholder', { ns: 'admin' })}
          {...form.getInputProps('specialty')}
        />
        <Select
          label={t('users.form.role', { ns: 'admin' })}
          data={roleOptions()}
          allowDeselect={false}
          description={roleDescription(form.values.role)}
          {...form.getInputProps('role')}
        />
        {!user && (
          <PasswordField
            label={t('users.form.password', { ns: 'admin' })}
            {...form.getInputProps('password')}
            onGenerate={() => form.setFieldValue('password', generatePassword())}
          />
        )}
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onDone}>
            {t('common:action.cancel')}
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            {user ? t('common:action.save') : t('users.createUser', { ns: 'admin' })}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function PasswordForm({ user, onDone }: { user: User; onDone: () => void }) {
  const { t } = useTranslation(['admin', 'common']);
  const me = useUser();
  const update = useUpdateUser();
  const form = useForm({
    mode: 'controlled',
    initialValues: { password: '' },
    validate: {
      password: (value) =>
        value.length >= MIN_PASSWORD_LENGTH
          ? null
          : t('users.form.passwordTooShort', { ns: 'admin', min: MIN_PASSWORD_LENGTH }),
    },
  });
  const submit = form.onSubmit(({ password }) =>
    update.mutate(
      { id: user.id, input: { password } },
      {
        onSuccess: () => {
          notifySuccess(
            user.id === me.id
              ? t('users.notify.passwordSetSelf', { ns: 'admin' })
              : t('users.notify.passwordSetOther', { ns: 'admin', name: user.full_name }),
          );
          onDone();
        },
      },
    ),
  );
  return (
    <form onSubmit={submit} noValidate>
      <Stack>
        <Text size="sm">
          <Trans
            i18nKey="users.form.setPasswordFor"
            ns="admin"
            values={{ name: user.full_name, email: user.email }}
            components={{ b: <b /> }}
          />
        </Text>
        <PasswordField
          label={t('users.form.newPassword', { ns: 'admin' })}
          {...form.getInputProps('password')}
          onGenerate={() => form.setFieldValue('password', generatePassword())}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onDone}>
            {t('common:action.cancel')}
          </Button>
          <Button type="submit" loading={update.isPending}>
            {t('users.form.setPassword', { ns: 'admin' })}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function UsersPage() {
  const { t } = useTranslation(['admin', 'common']);
  const me = useUser();
  const users = useUsers();
  const update = useUpdateUser();
  const deactivate = useDeactivateUser();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const close = () => setDialog(null);

  const confirmDeactivate = (user: User) =>
    modals.openConfirmModal({
      title: t('users.deactivateConfirm.title', { ns: 'admin' }),
      centered: true,
      children: <Text size="sm">{t('users.deactivateConfirm.body', { ns: 'admin', name: user.full_name })}</Text>,
      labels: { confirm: t('users.deactivate', { ns: 'admin' }), cancel: t('common:action.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        deactivate.mutate(user.id, { onSuccess: () => notifySuccess(t('users.notify.deactivated', { ns: 'admin' })) }),
    });

  const activate = (user: User) =>
    update.mutate(
      { id: user.id, input: { active: true } },
      { onSuccess: () => notifySuccess(t('users.notify.activated', { ns: 'admin' })) },
    );

  const header = (
    <PageHeader
      title={t('common:nav.users')}
      description={t('users.description', { ns: 'admin' })}
      actions={
        <Button leftSection={<IconUserPlus size={18} />} onClick={() => setDialog({ kind: 'create' })}>
          {t('users.newUser', { ns: 'admin' })}
        </Button>
      }
    />
  );

  const dialogs = (
    <>
      <Modal
        opened={dialog?.kind === 'create' || dialog?.kind === 'edit'}
        onClose={close}
        title={dialog?.kind === 'edit' ? t('users.editUser', { ns: 'admin' }) : t('users.newUser', { ns: 'admin' })}
        centered
      >
        {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
          <UserForm user={dialog.kind === 'edit' ? dialog.user : undefined} onDone={close} />
        )}
      </Modal>
      <Modal
        opened={dialog?.kind === 'password'}
        onClose={close}
        title={t('users.resetPasswordTitle', { ns: 'admin' })}
        centered
      >
        {dialog?.kind === 'password' && <PasswordForm user={dialog.user} onDone={close} />}
      </Modal>
    </>
  );

  const rows = (users.data ?? []).filter(
    (user) =>
      (!role || user.role === role) &&
      matchesQuery(`${user.full_name} ${user.email} ${user.position} ${user.specialty} ${user.job_title}`, search),
  );
  const paged = usePaged(rows);

  if (users.isPending)
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  if (users.isError)
    return (
      <>
        {header}
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      </>
    );

  return (
    <>
      {header}
      <Group mb="md" gap="sm" align="flex-end">
        <TextInput
          label={t('common:action.search')}
          placeholder={t('users.searchPlaceholder', { ns: 'admin' })}
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={{ base: '100%', sm: 280 }}
        />
        <Select
          label={t('users.form.role', { ns: 'admin' })}
          placeholder={t('users.rolePlaceholder', { ns: 'admin' })}
          data={roleOptions()}
          value={role}
          onChange={setRole}
          clearable
          w={200}
        />
      </Group>
      <Paper withBorder>
        <Table.ScrollContainer minWidth={680}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('users.table.name', { ns: 'admin' })}</Table.Th>
                <Table.Th>{t('users.table.role', { ns: 'admin' })}</Table.Th>
                <Table.Th>{t('users.table.status', { ns: 'admin' })}</Table.Th>
                <Table.Th>{t('users.table.created', { ns: 'admin' })}</Table.Th>
                <Table.Th w={130}>{t('users.table.actions', { ns: 'admin' })}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paged.items.map((user) => {
                const detail = personDetail(user);
                return (
                  <Table.Tr key={user.id} c={user.active ? undefined : 'dimmed'}>
                    <Table.Td>
                      <Text size="sm" fw={600}>
                        {user.full_name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {user.email}
                      </Text>
                      {detail && (
                        <Text size="xs" c="dimmed">
                          {detail}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <RoleBadge role={user.role} />
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4}>
                        <Badge color={user.active ? 'green' : 'gray'} variant="dot">
                          {user.active
                            ? t('users.statusActive', { ns: 'admin' })
                            : t('users.statusInactive', { ns: 'admin' })}
                        </Badge>
                        {user.must_change_password && (
                          <Tooltip label={t('users.mustChangeHint', { ns: 'admin' })}>
                            <Badge color="yellow" variant="light">
                              {t('users.newPasswordBadge', { ns: 'admin' })}
                            </Badge>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(user.created_at)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <Tooltip label={t('common:action.edit')}>
                          <ActionIcon
                            variant="subtle"
                            aria-label={t('users.editAria', { ns: 'admin', name: user.full_name })}
                            onClick={() => setDialog({ kind: 'edit', user })}
                          >
                            <IconEdit size={18} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label={t('users.resetPasswordTitle', { ns: 'admin' })}>
                          <ActionIcon
                            variant="subtle"
                            aria-label={t('users.resetPasswordAria', { ns: 'admin', name: user.full_name })}
                            onClick={() => setDialog({ kind: 'password', user })}
                          >
                            <IconKey size={18} />
                          </ActionIcon>
                        </Tooltip>
                        {user.active ? (
                          <Tooltip
                            label={
                              user.id === me.id
                                ? t('users.deactivateSelfHint', { ns: 'admin' })
                                : t('users.deactivate', { ns: 'admin' })
                            }
                          >
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              aria-label={t('users.deactivateAria', { ns: 'admin', name: user.full_name })}
                              disabled={user.id === me.id}
                              onClick={() => confirmDeactivate(user)}
                            >
                              <IconUserOff size={18} />
                            </ActionIcon>
                          </Tooltip>
                        ) : (
                          <Tooltip label={t('users.activate', { ns: 'admin' })}>
                            <ActionIcon
                              variant="subtle"
                              color="green"
                              aria-label={t('users.activateAria', { ns: 'admin', name: user.full_name })}
                              onClick={() => activate(user)}
                            >
                              <IconUserCheck size={18} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {rows.length === 0 && (
          <Text c="dimmed" ta="center" py="lg" size="sm">
            {t('users.empty', { ns: 'admin' })}
          </Text>
        )}
      </Paper>
      <TablePagination paged={paged} />
      {dialogs}
    </>
  );
}
