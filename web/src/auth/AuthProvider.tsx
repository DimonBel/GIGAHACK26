import { Button, Center, Loader, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { ApiError, setCsrfToken, setUnauthorizedHandler } from '../api/client';
import { authApi } from '../api/endpoints';
import { queryKeys } from '../api/queries';
import type { User } from '../api/types';
import i18n from '../i18n';
import { AuthContext, type AuthContextValue } from './context';

/** The current session's user, or null when nobody is signed in. */
async function loadSession(): Promise<User | null> {
  try {
    const session = await authApi.me();
    setCsrfToken(session.csrf_token);
    return session.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** Forgets the session and every cached answer that belonged to it. */
function endSession(queryClient: QueryClient) {
  setCsrfToken(null);
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.session[0] });
  queryClient.setQueryData(queryKeys.session, null);
}

/** Checks the session on load and provides the user; a 401 anywhere later signs the user out. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [signedOut, setSignedOut] = useState(false);
  const session = useQuery({
    queryKey: queryKeys.session,
    queryFn: loadSession,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    setUnauthorizedHandler(() => {
      const wasSignedIn = Boolean(queryClient.getQueryData(queryKeys.session));
      endSession(queryClient);
      if (wasSignedIn) {
        notifications.show({
          id: 'session-expired',
          color: 'yellow',
          title: i18n.t('session.expired'),
          message: i18n.t('session.signInAgain'),
        });
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session.data ?? null,
      signedOut,
      login: async (email, password) => {
        const { user, csrf_token } = await authApi.login(email, password);
        setCsrfToken(csrf_token);
        setSignedOut(false);
        queryClient.setQueryData(queryKeys.session, user);
        return user;
      },
      logout: async () => {
        try {
          await authApi.logout();
        } catch {
          // Signed out here even when the server cannot be reached; its session expires by itself.
        }
        setSignedOut(true);
        endSession(queryClient);
      },
      changePassword: async (current, next) => {
        const { user } = await authApi.changePassword(current, next);
        queryClient.setQueryData(queryKeys.session, user);
        return user;
      },
    }),
    [session.data, signedOut, queryClient],
  );

  if (session.isPending) {
    return (
      <Center h="100vh">
        <Loader aria-label={i18n.t('state.loading')} />
      </Center>
    );
  }
  if (session.isError) {
    return (
      <Center h="100vh" p="md">
        <Stack align="center" gap="sm" maw={420} ta="center">
          <Title order={3}>{i18n.t('state.unavailable')}</Title>
          <Text c="dimmed">{session.error.message}</Text>
          <Button onClick={() => void session.refetch()} loading={session.isFetching}>
            {i18n.t('action.retry')}
          </Button>
        </Stack>
      </Center>
    );
  }
  return <AuthContext value={value}>{children}</AuthContext>;
}
