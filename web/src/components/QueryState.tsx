import { Alert, Button, Center, Loader, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

import { ApiError } from '../api/client';

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <Center py="xl">
      <Loader aria-label={label} />
    </Center>
  );
}

/** A failed load, with the server's message; "not found" also covers another moderator's meeting. */
export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <Alert
      color={notFound ? 'gray' : 'red'}
      icon={<IconAlertTriangle />}
      title={notFound ? 'Not found' : 'Could not load this page'}
    >
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{notFound ? 'It does not exist, or you do not have access to it.' : error.message}</Text>
        {onRetry && !notFound && (
          <Button size="xs" variant="light" color="red" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
