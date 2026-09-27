import { Alert, Box, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconShieldLock } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';

import { useAuth } from '../auth/context';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { isEmail } from '../lib/email';
import { homePath } from '../lib/roles';

/** A path of this app ("/meetings/6f1c"), not another site ("//evil.example", "/\evil.example"). */
const APP_PATH = /^\/(?![/\\])/;

/** Where the guard sent the user from, to return there after signing in. */
function returnPath(state: unknown): string | null {
  if (typeof state === 'object' && state !== null && 'from' in state && typeof state.from === 'string') {
    return APP_PATH.test(state.from) ? state.from : null;
  }
  return null;
}

export function LoginPage() {
  const { t } = useTranslation(['auth', 'common']);
  const { user, login } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { email: '', password: '' },
    validate: {
      email: (value) => (isEmail(value) ? null : t('login.enterEmail')),
      password: (value) => (value ? null : t('login.enterPassword')),
    },
  });

  if (user) return <Navigate to={returnPath(location.state) ?? homePath()} replace />;

  const submit = form.onSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : t('login.failed'));
    }
  });

  return (
    <Center mih="100vh" p="md" bg="gray.0" pos="relative">
      <Box pos="absolute" top={16} right={16}>
        <LanguageSwitcher />
      </Box>
      <Box w="100%" maw={400}>
        <Stack align="center" gap={4} mb="lg">
          <IconShieldLock size={44} color="var(--mantine-color-teal-6)" aria-hidden />
          <Title order={2}>{t('common:app.name')}</Title>
          <Text c="dimmed" size="sm">
            {t('common:app.tagline')}
          </Text>
        </Stack>
        <Paper withBorder shadow="sm" p="xl">
          <form onSubmit={submit} noValidate>
            <Stack>
              <TextInput
                label={t('login.email')}
                type="email"
                autoComplete="username"
                required
                key={form.key('email')}
                {...form.getInputProps('email')}
              />
              <PasswordInput
                label={t('login.password')}
                autoComplete="current-password"
                required
                key={form.key('password')}
                {...form.getInputProps('password')}
              />
              {error && (
                <Alert color="red" icon={<IconAlertTriangle />} role="alert">
                  {error}
                </Alert>
              )}
              <Button type="submit" loading={form.submitting} fullWidth>
                {t('login.submit')}
              </Button>
            </Stack>
          </form>
        </Paper>
        <Text size="xs" c="dimmed" ta="center" mt="md">
          {t('login.copyright')}
        </Text>
      </Box>
    </Center>
  );
}
