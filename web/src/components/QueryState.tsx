import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../api/client';

export function LoadingState({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <Center py="xl">
      <Loader aria-label={label ?? t('state.loading')} />
    </Center>
  );
}

/** A failed load, with the server's message; "not found" also covers another moderator's meeting. */
export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const { t } = useTranslation();
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <Alert
      color={notFound ? 'gray' : 'red'}
      icon={<IconAlertTriangle />}
      title={notFound ? t('state.notFound') : t('state.loadFailed')}
    >
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{notFound ? t('state.notFoundText') : error.message}</Text>
        {onRetry && !notFound && (
          <Button size="xs" variant="light" color="red" onClick={onRetry}>
            {t('action.retry')}
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
