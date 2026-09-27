import { Alert, Button, Paper, PasswordInput, Stack } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconKey } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('auth');
  const user = useUser();
  const { changePassword } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { current: '', next: '', repeat: '' },
    validate: {
      current: (value) => (value ? null : t('password.enterCurrent')),
      next: (value, values) => {
        if (value.length < MIN_PASSWORD_LENGTH) return t('password.tooShort', { min: MIN_PASSWORD_LENGTH });
        return value === values.current ? t('password.same') : null;
      },
      repeat: (value, values) => (value === values.next ? null : t('password.differ')),
    },
  });

  const submit = form.onSubmit(async ({ current, next }) => {
    setError(null);
    try {
      await changePassword(current, next);
      notifySuccess(t('password.changed'));
      void navigate(homePath(), { replace: true });
    } catch (changeError) {
      const message = changeError instanceof Error ? changeError.message : t('password.failed');
      const [name, problem] = message.split(/: (.*)/s);
      if (SERVER_FIELDS[name] && problem) form.setFieldError(SERVER_FIELDS[name], capitalize(problem));
      else setError(message);
    }
  });

  return (
    <>
      <PageHeader
        title={t('password.title')}
        description={user.must_change_password ? t('password.mustChange') : t('password.otherSessions')}
      />
      <Paper withBorder p="lg" maw={440}>
        <form onSubmit={submit} noValidate>
          <Stack>
            <PasswordInput
              label={t('password.current')}
              autoComplete="current-password"
              required
              key={form.key('current')}
              {...form.getInputProps('current')}
            />
            <PasswordInput
              label={t('password.new')}
              description={t('password.newHint', { min: MIN_PASSWORD_LENGTH })}
              autoComplete="new-password"
              required
              key={form.key('next')}
              {...form.getInputProps('next')}
            />
            <PasswordInput
              label={t('password.repeat')}
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
              {t('password.submit')}
            </Button>
          </Stack>
        </form>
      </Paper>
    </>
  );
}
