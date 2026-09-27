import { Avatar, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useUser } from '../auth/context';
import { RoleBadge } from '../components/Badges';
import { PageHeader } from '../components/PageHeader';
import { formatDateTime, initials } from '../lib/format';
import { CHANGE_PASSWORD_PATH } from '../lib/roles';

/** The signed-in user's own details, as an administrator entered them, and the way to change the password. */
export function ProfilePage() {
  const { t } = useTranslation(['auth', 'common']);
  const user = useUser();
  const details = [
    { label: t('profile.email'), value: user.email },
    { label: t('profile.jobTitle'), value: user.job_title },
    { label: t('profile.position'), value: user.position },
    { label: t('profile.specialty'), value: user.specialty },
    { label: t('profile.since'), value: formatDateTime(user.created_at) },
  ];
  return (
    <>
      <PageHeader title={t('common:account.profile')} />
      <Paper withBorder p="xl" maw={720}>
        <Stack gap="xl">
          <Group gap="lg" wrap="nowrap">
            <Avatar color="teal" radius="xl" size={72}>
              {initials(user.full_name || user.email)}
            </Avatar>
            <Stack gap={6}>
              <Title order={2}>{user.full_name || user.email}</Title>
              <Group gap="xs">
                <Text size="sm" c="dimmed">
                  {t('profile.role')}
                </Text>
                <RoleBadge role={user.role} />
              </Group>
            </Stack>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" verticalSpacing="md">
            {details.map(({ label, value }) => (
              <Stack key={label} gap={2}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                  {label}
                </Text>
                <Text c={value ? undefined : 'dimmed'}>{value || t('profile.notSet')}</Text>
              </Stack>
            ))}
          </SimpleGrid>
          <Group justify="space-between" gap="sm">
            <Text size="sm" c="dimmed" maw={420}>
              {t('profile.managed')}
            </Text>
            <Button component={Link} to={CHANGE_PASSWORD_PATH} variant="default" leftSection={<IconKey size={16} />}>
              {t('profile.changePassword')}
            </Button>
          </Group>
        </Stack>
      </Paper>
    </>
  );
}
