import { Alert, Box, Button, Center, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconLock, IconShieldLock } from '@tabler/icons-react';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useAuth } from '../auth/context';
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
  const { user, login } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    mode: 'uncontrolled',
    initialValues: { email: '', password: '' },
    validate: {
      email: (value) => (isEmail(value) ? null : 'Enter your email address'),
      password: (value) => (value ? null : 'Enter your password'),
    },
  });

  if (user) return <Navigate to={returnPath(location.state) ?? homePath(user.role)} replace />;

  const submit = form.onSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Sign-in failed.');
    }
  });

  return (
    <Center mih="100vh" p="md" bg="gray.0">
      <Box w="100%" maw={400}>
        <Stack align="center" gap={4} mb="lg">
          <IconShieldLock size={44} color="var(--mantine-color-teal-6)" aria-hidden />
          <Title order={2}>Secure MOM</Title>
          <Text c="dimmed" size="sm">
            Medpark · Minutes of Meeting
          </Text>
        </Stack>
        <Paper withBorder shadow="sm" p="xl">
          <form onSubmit={submit} noValidate>
            <Stack>
              <TextInput
                label="Email"
                type="email"
                autoComplete="username"
                required
                key={form.key('email')}
                {...form.getInputProps('email')}
              />
              <PasswordInput
                label="Password"
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
                Sign in
              </Button>
            </Stack>
          </form>
        </Paper>
        <Group justify="center" gap={6} mt="md">
          <IconLock size={14} color="var(--mantine-color-dimmed)" aria-hidden />
          <Text size="xs" c="dimmed">
            Runs on the hospital&apos;s own server. No data leaves the network.
          </Text>
        </Group>
      </Box>
    </Center>
  );
}
