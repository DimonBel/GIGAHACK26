import {
  AppShell,
  Avatar,
  Burger,
  Container,
  Drawer,
  Group,
  Menu,
  NavLink,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAddressBook,
  IconChevronDown,
  IconClipboardList,
  IconFileText,
  IconHistory,
  IconLayoutDashboard,
  IconLogout,
  IconMicrophone,
  IconSettings,
  IconShieldLock,
  IconTemplate,
  IconUserCircle,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';
import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useLocation } from 'react-router';

import type { Role, User } from '../api/types';
import { useAuth, useUser } from '../auth/context';
import { initials } from '../lib/format';
import { HEADER_HEIGHT, PAGE_WIDTH } from '../lib/layout';
import { roleLabel } from '../lib/roles';
import { CANVAS } from '../theme';
import { LanguageSwitcher } from './LanguageSwitcher';

/** Remounts on every path change, replaying its fade-in: a calm cue that the page really did change. */
function AnimatedOutlet() {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="route-fade">
      <Outlet />
    </div>
  );
}

interface NavItem {
  to: string;
  label: ParseKeys<'common'>;
  icon: Icon;
  roles: Role[];
  admin?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'nav.dashboard', icon: IconLayoutDashboard, roles: ['admin', 'moderator', 'user'] },
  { to: '/meetings', label: 'nav.meetings', icon: IconClipboardList, roles: ['admin', 'moderator'] },
  { to: '/meetings/new', label: 'nav.newMeeting', icon: IconMicrophone, roles: ['admin', 'moderator'] },
  { to: '/my-minutes', label: 'nav.myMinutes', icon: IconFileText, roles: ['user'] },
  { to: '/admin/users', label: 'nav.users', icon: IconUsers, roles: ['admin'], admin: true },
  { to: '/admin/lists', label: 'nav.lists', icon: IconAddressBook, roles: ['admin'], admin: true },
  { to: '/admin/templates', label: 'nav.templates', icon: IconTemplate, roles: ['admin'], admin: true },
  { to: '/admin/settings', label: 'nav.settings', icon: IconSettings, roles: ['admin'], admin: true },
  { to: '/admin/audit', label: 'nav.audit', icon: IconHistory, roles: ['admin'], admin: true },
];

/** The item for a path: the longest link that is the path or one of its parents ("/" only for itself). */
function activeItem(items: NavItem[], pathname: string): NavItem | undefined {
  return items
    .filter((item) => pathname === item.to || (item.to !== '/' && pathname.startsWith(`${item.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];
}

function UserMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { t } = useTranslation();
  const detail = user.job_title || user.position || roleLabel(user.role);
  return (
    <Menu position="bottom-end" width={260} withinPortal>
      <Menu.Target>
        <UnstyledButton aria-label={t('account.menu')}>
          <Group gap="xs" wrap="nowrap">
            <Avatar color="teal" radius="xl" size="md">
              {initials(user.full_name || user.email)}
            </Avatar>
            <Stack gap={0} visibleFrom="sm">
              <Text size="sm" fw={600} lh={1.2}>
                {user.full_name || user.email}
              </Text>
              <Text size="xs" c="dimmed" lh={1.2}>
                {detail}
              </Text>
            </Stack>
            <IconChevronDown size={14} />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{roleLabel(user.role)}</Menu.Label>
        <Menu.Item component={Link} to="/profile" leftSection={<IconUserCircle size={16} />}>
          {t('account.profile')}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item leftSection={<IconLogout size={16} />} onClick={onLogout} color="red">
          {t('account.signOut')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/** The menu: the pages of the user's role, then the administration pages. */
function NavList({ items, active, onNavigate }: { items: NavItem[]; active?: NavItem; onNavigate: () => void }) {
  const { t } = useTranslation();
  const link = (item: NavItem) => (
    <NavLink
      key={item.to}
      component={Link}
      to={item.to}
      label={t(item.label)}
      leftSection={<item.icon size={18} stroke={1.6} />}
      active={item === active}
      aria-current={item === active ? 'page' : undefined}
      onClick={onNavigate}
    />
  );
  const admin = items.filter((item) => item.admin);
  return (
    <nav aria-label={t('nav.main')}>
      {items.filter((item) => !item.admin).map(link)}
      {admin.length > 0 && (
        <>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt="md" mb={4} px="sm">
            {t('nav.administration')}
          </Text>
          {admin.map(link)}
        </>
      )}
    </nav>
  );
}

/** Header, side menu and the current page, all in one centred column with room on both sides (medpark.md's
 *  layout); on smaller screens the menu opens from the side. */
export function AppLayout() {
  const { t } = useTranslation();
  const [opened, { toggle, close }] = useDisclosure();
  const { logout } = useAuth();
  const user = useUser();
  const { pathname } = useLocation();
  // Nothing to navigate to until a password an admin chose is replaced.
  const items = user.must_change_password ? [] : NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const active = activeItem(items, pathname);

  return (
    <AppShell header={{ height: HEADER_HEIGHT }} padding={0}>
      <AppShell.Header className="no-print">
        <Container size={PAGE_WIDTH} h="100%" px={{ base: 'md', sm: 'lg' }}>
          <Group h="100%" justify="space-between" wrap="nowrap" gap="md">
            <Group gap="md" wrap="nowrap">
              <Burger opened={opened} onClick={toggle} hiddenFrom="lg" size="sm" aria-label={t('nav.toggle')} />
              <UnstyledButton component={Link} to="/" aria-label={t('nav.home')} onClick={close}>
                <Group gap="sm" wrap="nowrap">
                  <IconShieldLock size={30} color="var(--mantine-color-teal-6)" aria-hidden />
                  <Stack gap={0} style={{ whiteSpace: 'nowrap' }}>
                    <Text fw={700} lh={1.15}>
                      {t('app.name')}
                    </Text>
                    <Text size="xs" c="dimmed" lh={1.15} visibleFrom="xs">
                      {t('app.tagline')}
                    </Text>
                  </Stack>
                </Group>
              </UnstyledButton>
            </Group>
            <Group gap="sm" wrap="nowrap">
              <LanguageSwitcher />
              <UserMenu user={user} onLogout={() => void logout()} />
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <Drawer opened={opened} onClose={close} size={280} hiddenFrom="lg" title={t('app.name')} className="no-print">
        <NavList items={items} active={active} onNavigate={close} />
      </Drawer>

      <AppShell.Main bg={CANVAS}>
        <Container size={PAGE_WIDTH} px={{ base: 'md', sm: 'lg' }} py={{ base: 'md', sm: 'xl' }}>
          <div className="app-columns">
            {items.length > 0 && (
              <Paper withBorder p="xs" visibleFrom="lg" className="app-sidebar no-print">
                <NavList items={items} active={active} onNavigate={close} />
              </Paper>
            )}
            <div style={{ minWidth: 0 }}>
              <AnimatedOutlet />
            </div>
          </div>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
