import { AppShell, Avatar, Badge, Burger, Group, Menu, NavLink, Stack, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAddressBook,
  IconChevronDown,
  IconClipboardList,
  IconFileText,
  IconHistory,
  IconKey,
  IconLock,
  IconLogout,
  IconMicrophone,
  IconSettings,
  IconShieldLock,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';
import { Link, Outlet, useLocation } from 'react-router';

import type { Role, User } from '../api/types';
import { useAuth, useUser } from '../auth/context';
import { HEADER_HEIGHT } from '../lib/layout';
import { CHANGE_PASSWORD_PATH, roleLabel } from '../lib/roles';

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  roles: Role[];
  admin?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/meetings', label: 'Meetings', icon: IconClipboardList, roles: ['admin', 'moderator'] },
  { to: '/meetings/new', label: 'New meeting', icon: IconMicrophone, roles: ['admin', 'moderator'] },
  { to: '/my-minutes', label: 'My minutes', icon: IconFileText, roles: ['user'] },
  { to: '/admin/users', label: 'Users', icon: IconUsers, roles: ['admin'], admin: true },
  { to: '/admin/lists', label: 'Distribution lists', icon: IconAddressBook, roles: ['admin'], admin: true },
  { to: '/admin/settings', label: 'Settings', icon: IconSettings, roles: ['admin'], admin: true },
  { to: '/admin/audit', label: 'Audit log', icon: IconHistory, roles: ['admin'], admin: true },
];

const NAVBAR_WIDTH = 250;

/** The item for a path: the longest link that is the path or one of its parents. */
function activeItem(items: NavItem[], pathname: string): NavItem | undefined {
  return items
    .filter((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function UserMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <Menu position="bottom-end" width={240} withinPortal>
      <Menu.Target>
        <UnstyledButton aria-label="Account menu">
          <Group gap="xs" wrap="nowrap">
            <Avatar color="teal" radius="xl" size="md">
              {initials(user.full_name || user.email)}
            </Avatar>
            <Stack gap={0} visibleFrom="sm">
              <Text size="sm" fw={600} lh={1.2}>
                {user.full_name || user.email}
              </Text>
              <Text size="xs" c="dimmed" lh={1.2}>
                {user.position || roleLabel(user.role)}
              </Text>
            </Stack>
            <IconChevronDown size={14} />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          {user.email} · {roleLabel(user.role)}
        </Menu.Label>
        <Menu.Item component={Link} to={CHANGE_PASSWORD_PATH} leftSection={<IconKey size={16} />}>
          Change password
        </Menu.Item>
        <Menu.Item leftSection={<IconLogout size={16} />} onClick={onLogout}>
          Sign out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/** Header, role-based navigation and the current page. */
export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { logout } = useAuth();
  const user = useUser();
  const { pathname } = useLocation();
  // Nothing to navigate to until a password an admin chose is replaced.
  const items = user.must_change_password ? [] : NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const active = activeItem(items, pathname);

  const renderItem = (item: NavItem) => (
    <NavLink
      key={item.to}
      component={Link}
      to={item.to}
      label={item.label}
      leftSection={<item.icon size={18} stroke={1.6} />}
      active={item === active}
      onClick={close}
    />
  );

  return (
    <AppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{ width: NAVBAR_WIDTH, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header className="no-print">
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Toggle navigation" />
            <IconShieldLock size={28} color="var(--mantine-color-teal-6)" aria-hidden />
            <Stack gap={0}>
              <Text fw={700} lh={1.1}>
                Secure MOM
              </Text>
              <Text size="xs" c="dimmed" lh={1.1}>
                Medpark · Minutes of Meeting
              </Text>
            </Stack>
          </Group>
          <Group gap="md" wrap="nowrap">
            <Badge
              visibleFrom="md"
              variant="light"
              color="teal"
              leftSection={<IconLock size={12} />}
              title="Audio, transcripts and minutes are processed on this server only"
            >
              On-premises · offline
            </Badge>
            <UserMenu user={user} onLogout={() => void logout()} />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" className="no-print" aria-label="Main navigation">
        {items.filter((item) => !item.admin).map(renderItem)}
        {items.some((item) => item.admin) && (
          <>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt="md" mb={4} px="sm">
              Administration
            </Text>
            {items.filter((item) => item.admin).map(renderItem)}
          </>
        )}
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
