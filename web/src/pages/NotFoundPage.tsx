import { Button, EmptyState } from '@mantine/core';
import { IconMapOff } from '@tabler/icons-react';
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <EmptyState
      mt="xl"
      icon={<IconMapOff />}
      title="Page not found"
      description="The address does not exist, or you do not have access to it."
    >
      <Button component={Link} to="/" variant="light">
        Go to the start page
      </Button>
    </EmptyState>
  );
}
