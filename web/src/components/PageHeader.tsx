import { Anchor, Group, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}

export function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <Stack gap={6} mb="lg">
      {back && (
        <Anchor component={Link} to={back.to} size="sm" c="dimmed" className="no-print">
          <Group gap={4}>
            <IconArrowLeft size={14} />
            {back.label}
          </Group>
        </Anchor>
      )}
      <Group justify="space-between" align="flex-start" gap="sm">
        <Stack gap={4}>
          <Title order={2}>{title}</Title>
          {description && (
            <Text c="dimmed" size="sm" component="div">
              {description}
            </Text>
          )}
        </Stack>
        {actions && (
          <Group gap="xs" className="no-print">
            {actions}
          </Group>
        )}
      </Group>
    </Stack>
  );
}
