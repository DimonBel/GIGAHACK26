import { Alert, Button, Paper, PasswordInput, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconKey } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useAuth, useUser } from '../auth/context';
import { PageHeader } from '../components/PageHeader';
import { notifySuccess } from '../lib/notify';
import { homePath } from '../lib/roles';

const MIN_PASSWORD_LENGTH = 12;
/** The server names the field in front of its message: "current: the password is wrong". */
const SERVER_FIELDS: Record<string, 'current' | 'next'> = { current: 'current', new: 'next' };

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The signed-in user's own password: the only page while they sign in with one an admin chose. */
export function ChangePasswordPage() {
  const user = useUser();
  const { changePassword } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { current: '', next: '', repeat: '' },
    validate: {
      current: (value) => (value ? null : 'Enter your current password'),
      next: (value, values) => {
        if (value.length < MIN_PASSWORD_LENGTH) return `At least ${MIN_PASSWORD_LENGTH} characters`;
        return value === values.current ? 'Choose a new password' : null;
      },
      repeat: (value, values) => (value === values.next ? null : 'The passwords differ'),
    },
  });

  const submit = form.onSubmit(async ({ current, next }) => {
    setError(null);
    try {
      const updated = await changePassword(current, next);
      notifySuccess('Password changed. Your other sessions were signed out.');
      void navigate(homePath(updated.role), { replace: true });
    } catch (changeError) {
      const message = changeError instanceof Error ? changeError.message : 'The password could not be changed.';
      const [name, problem] = message.split(/: (.*)/s);
      if (SERVER_FIELDS[name] && problem) form.setFieldError(SERVER_FIELDS[name], capitalize(problem));
      else setError(message);
    }
  });

  return (
    <>
      <PageHeader
        title="Change password"
        description={
          user.must_change_password
            ? 'An administrator set your password. Choose your own to continue.'
            : 'Your other sessions are signed out when you change it.'
        }
      />
      <Paper withBorder p="lg" maw={440}>
        <form onSubmit={submit} noValidate>
          <Stack>
            <PasswordInput
              label="Current password"
              autoComplete="current-password"
              required
              key={form.key('current')}
              {...form.getInputProps('current')}
            />
            <PasswordInput
              label="New password"
              description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
              autoComplete="new-password"
              required
              key={form.key('next')}
              {...form.getInputProps('next')}
            />
            <PasswordInput
              label="Repeat the new password"
              autoComplete="new-password"
              required
              key={form.key('repeat')}
              {...form.getInputProps('repeat')}
            />
            {error && (
              <Alert color="red" icon={<IconAlertTriangle />} role="alert">
                {error}
              </Alert>
            )}
            <Button type="submit" loading={form.submitting} leftSection={<IconKey size={16} />}>
              Change password
            </Button>
          </Stack>
        </form>
      </Paper>
    </>
  );
}
