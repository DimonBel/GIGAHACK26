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

import { useCreateUser, useDeactivateUser, useUpdateUser, useUsers } from '../../api/queries';
import type { User } from '../../api/types';
import { useUser } from '../../auth/context';
import { RoleBadge } from '../../components/Badges';
import { PageHeader } from '../../components/PageHeader';
import { ErrorState, LoadingState } from '../../components/QueryState';
import { isEmail } from '../../lib/email';
import { formatDateTime } from '../../lib/format';
import { notifySuccess } from '../../lib/notify';
import { ROLES } from '../../lib/roles';
import { matchesQuery } from '../../lib/search';

const MIN_PASSWORD_LENGTH = 12;
const GENERATED_PASSWORD_LENGTH = 16;
// No look-alike characters (0/O, 1/l/I), so a generated password can be read out or typed.
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.';
const ROLE_OPTIONS = ROLES.map(({ value, label }) => ({ value, label }));

type Dialog = { kind: 'create' } | { kind: 'edit'; user: User } | { kind: 'password'; user: User };

function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(GENERATED_PASSWORD_LENGTH));
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('');
}

const passwordRule = (value: string) =>
  value.length >= MIN_PASSWORD_LENGTH ? null : `At least ${MIN_PASSWORD_LENGTH} characters`;

/** Password input with a generator; a generated password is shown so it can be handed over. */
function PasswordField({ onGenerate, ...inputProps }: PasswordInputProps & { onGenerate: () => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <Stack gap={4}>
      <PasswordInput
        {...inputProps}
        description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
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
        Generate a strong password
      </Button>
    </Stack>
  );
}

function UserForm({ user, onDone }: { user?: User; onDone: () => void }) {
  const create = useCreateUser();
  const update = useUpdateUser();
  const form = useForm({
    mode: 'controlled',
    initialValues: {
      email: user?.email ?? '',
      full_name: user?.full_name ?? '',
      position: user?.position ?? '',
      role: user?.role ?? 'user',
      password: '',
    },
    validate: {
      email: (value) => (user || isEmail(value) ? null : 'Enter a valid email address'),
      full_name: (value) => (value.trim() ? null : 'Enter the full name'),
      password: (value) => (user ? null : passwordRule(value)),
    },
  });

  const submit = form.onSubmit(({ email, full_name, position, role, password }) => {
    const details = { full_name: full_name.trim(), position: position.trim(), role };
    const onSuccess = () => {
      notifySuccess(user ? 'User updated.' : 'User created. They choose their own password when they first sign in.');
      onDone();
    };
    if (user) update.mutate({ id: user.id, input: details }, { onSuccess });
    else create.mutate({ ...details, email: email.trim(), password }, { onSuccess });
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack>
        <TextInput label="Email" type="email" required disabled={Boolean(user)} {...form.getInputProps('email')} />
        <TextInput label="Full name" required {...form.getInputProps('full_name')} />
        <TextInput label="Position" placeholder="e.g. Cardiologist" {...form.getInputProps('position')} />
        <Select
          label="Role"
          data={ROLE_OPTIONS}
          allowDeselect={false}
          description={ROLES.find((role) => role.value === form.values.role)?.description}
          {...form.getInputProps('role')}
        />
        {!user && (
          <PasswordField
            label="Password"
            {...form.getInputProps('password')}
            onGenerate={() => form.setFieldValue('password', generatePassword())}
          />
        )}
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            {user ? 'Save' : 'Create user'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

function PasswordForm({ user, onDone }: { user: User; onDone: () => void }) {
  const me = useUser();
  const update = useUpdateUser();
  const form = useForm({
    mode: 'controlled',
    initialValues: { password: '' },
    validate: { password: passwordRule },
  });
  const submit = form.onSubmit(({ password }) =>
    update.mutate(
      { id: user.id, input: { password } },
      {
        onSuccess: () => {
          notifySuccess(
            user.id === me.id
              ? 'Your new password is set.'
              : `New password set for ${user.full_name}. Give it to them in person: they choose their own when they sign in.`,
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
          Set a new password for <b>{user.full_name}</b> ({user.email}).
        </Text>
        <PasswordField
          label="New password"
          {...form.getInputProps('password')}
          onGenerate={() => form.setFieldValue('password', generatePassword())}
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={update.isPending}>
            Set password
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function UsersPage() {
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
      title: 'Deactivate this user?',
      centered: true,
      children: (
        <Text size="sm">
          {user.full_name} can no longer sign in or receive minutes. You can activate the account again later.
        </Text>
      ),
      labels: { confirm: 'Deactivate', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => deactivate.mutate(user.id, { onSuccess: () => notifySuccess('User deactivated.') }),
    });

  const activate = (user: User) =>
    update.mutate({ id: user.id, input: { active: true } }, { onSuccess: () => notifySuccess('User activated.') });

  const header = (
    <PageHeader
      title="Users"
      description="Staff who can sign in: administrators, moderators and readers of the minutes."
      actions={
        <Button leftSection={<IconUserPlus size={18} />} onClick={() => setDialog({ kind: 'create' })}>
          New user
        </Button>
      }
    />
  );

  const dialogs = (
    <>
      <Modal
        opened={dialog?.kind === 'create' || dialog?.kind === 'edit'}
        onClose={close}
        title={dialog?.kind === 'edit' ? 'Edit user' : 'New user'}
        centered
      >
        {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
          <UserForm user={dialog.kind === 'edit' ? dialog.user : undefined} onDone={close} />
        )}
      </Modal>
      <Modal opened={dialog?.kind === 'password'} onClose={close} title="Reset password" centered>
        {dialog?.kind === 'password' && <PasswordForm user={dialog.user} onDone={close} />}
      </Modal>
    </>
  );

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

  const rows = users.data.filter(
    (user) => (!role || user.role === role) && matchesQuery(`${user.full_name} ${user.email} ${user.position}`, search),
  );

  return (
    <>
      {header}
      <Group mb="md" gap="sm" align="flex-end">
        <TextInput
          label="Search"
          placeholder="Name, email or position"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={{ base: '100%', sm: 280 }}
        />
        <Select
          label="Role"
          placeholder="Any role"
          data={ROLE_OPTIONS}
          value={role}
          onChange={setRole}
          clearable
          w={200}
        />
      </Group>
      <Paper withBorder>
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Position</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th w={130}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((user) => (
                <Table.Tr key={user.id} c={user.active ? undefined : 'dimmed'}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {user.full_name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {user.email}
                    </Text>
                  </Table.Td>
                  <Table.Td>{user.position || '—'}</Table.Td>
                  <Table.Td>
                    <RoleBadge role={user.role} />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Badge color={user.active ? 'green' : 'gray'} variant="dot">
                        {user.active ? 'Active' : 'Inactive'}
                      </Badge>
                      {user.must_change_password && (
                        <Tooltip label="Signs in with a password an administrator chose, until they choose their own">
                          <Badge color="yellow" variant="light">
                            New password
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
                      <Tooltip label="Edit">
                        <ActionIcon
                          variant="subtle"
                          aria-label={`Edit ${user.full_name}`}
                          onClick={() => setDialog({ kind: 'edit', user })}
                        >
                          <IconEdit size={18} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Reset password">
                        <ActionIcon
                          variant="subtle"
                          aria-label={`Reset the password of ${user.full_name}`}
                          onClick={() => setDialog({ kind: 'password', user })}
                        >
                          <IconKey size={18} />
                        </ActionIcon>
                      </Tooltip>
                      {user.active ? (
                        <Tooltip label={user.id === me.id ? 'You cannot deactivate yourself' : 'Deactivate'}>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            aria-label={`Deactivate ${user.full_name}`}
                            disabled={user.id === me.id}
                            onClick={() => confirmDeactivate(user)}
                          >
                            <IconUserOff size={18} />
                          </ActionIcon>
                        </Tooltip>
                      ) : (
                        <Tooltip label="Activate">
                          <ActionIcon
                            variant="subtle"
                            color="green"
                            aria-label={`Activate ${user.full_name}`}
                            onClick={() => activate(user)}
                          >
                            <IconUserCheck size={18} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {rows.length === 0 && (
          <Text c="dimmed" ta="center" py="lg" size="sm">
            No user matches.
          </Text>
        )}
      </Paper>
      {dialogs}
    </>
  );
}
