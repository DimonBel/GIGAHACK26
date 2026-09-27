import { Button, EmptyState } from '@mantine/core';
import { IconMapOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState mt="xl" icon={<IconMapOff />} title={t('notFound.title')} description={t('notFound.description')}>
      <Button component={Link} to="/" variant="light">
        {t('notFound.home')}
      </Button>
    </EmptyState>
  );
}
