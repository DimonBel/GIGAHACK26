import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useRouteError } from 'react-router';

/** Shown when a page crashes, instead of a blank screen. */
export function RouteErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : t('crash.unknown');
  return (
    <Center mih="60vh" p="md">
      <Stack align="center" gap="sm" maw={480} ta="center">
        <Title order={3}>{t('crash.title')}</Title>
        <Text c="dimmed" size="sm">
          {message}
        </Text>
        <Button onClick={() => window.location.reload()}>{t('crash.reload')}</Button>
      </Stack>
    </Center>
  );
}
