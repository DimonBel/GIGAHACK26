import {
  Anchor,
  Card,
  Grid,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconChecks, IconClockHour4, IconFileText, IconMailForward, IconPencil, type Icon } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useLists, useMeetings, useUsers } from '../api/queries';
import type { Meeting, MeetingStatus } from '../api/types';
import { useUser } from '../auth/context';
import { MeetingStatusBadge, MeetingTypeBadge } from '../components/Badges';
import { PageHeader } from '../components/PageHeader';
import { ErrorState, LoadingState } from '../components/QueryState';
import { useNow } from '../hooks/useNow';
import { formatDateTime, formatDay } from '../lib/format';
import { isProcessing } from '../lib/meeting';

const MINUTE_MS = 60_000;
const RECENT = 6;
const ATTENTION: MeetingStatus[] = ['ready', 'approved', 'failed'];

const newestFirst = (a: Meeting, b: Meeting) => b.created_at.localeCompare(a.created_at);

/** "Good morning, Ion" and today's date, kept current. */
function useGreeting() {
  const { t } = useTranslation('dashboard');
  const user = useUser();
  const now = useNow(MINUTE_MS);
  const hour = new Date(now).getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const name = user.full_name.split(/\s+/)[0] || user.email;
  return { title: t(`greeting.${part}`, { name }), date: formatDay(new Date(now)) };
}

function Stat({ label, value, icon: StatIcon, color }: { label: string; value: number; icon: Icon; color: string }) {
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2}>
          <Text size="sm" c="dimmed">
            {label}
          </Text>
          <Text fz={28} fw={700} lh={1.2}>
            {value}
          </Text>
        </Stack>
        <ThemeIcon variant="light" color={color} size="lg" radius="md">
          <StatIcon size={20} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

/** A meeting in a dashboard list: title, type, when, and its status (or what to do next). */
function MeetingRow({ meeting, hint }: { meeting: Meeting; hint?: string }) {
  return (
    <UnstyledButton component={Link} to={`/meetings/${meeting.id}`} className="dashboard-row" p="sm">
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Stack gap={2} miw={0}>
          <Text size="sm" fw={600} truncate>
            {meeting.title}
          </Text>
          <Text size="xs" c="dimmed" truncate>
            {hint ?? formatDateTime(meeting.created_at)}
          </Text>
        </Stack>
        <Group gap={6} wrap="nowrap">
          <MeetingTypeBadge type={meeting.meeting_type} />
          <MeetingStatusBadge status={meeting.status} />
        </Group>
      </Group>
    </UnstyledButton>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="sm">
        <Title order={3} size="h4">
          {title}
        </Title>
        {action}
      </Group>
      {children}
    </Paper>
  );
}

function AdminSummary() {
  const { t } = useTranslation(['dashboard', 'common']);
  const users = useUsers();
  const lists = useLists();
  const active = users.data?.filter((user) => user.active).length;
  return (
    <Section title={t('admin.title')}>
      <Stack gap={6}>
        {active !== undefined && (
          <Anchor component={Link} to="/admin/users" size="sm">
            {t('admin.activeUsers', { count: active })}
          </Anchor>
        )}
        {lists.data && (
          <Anchor component={Link} to="/admin/lists" size="sm">
            {t('admin.lists', { count: lists.data.length })}
          </Anchor>
        )}
        <Anchor component={Link} to="/admin/audit" size="sm">
          {t('common:nav.audit')}
        </Anchor>
      </Stack>
    </Section>
  );
}

function StaffDashboard({ meetings }: { meetings: Meeting[] }) {
  const { t } = useTranslation(['dashboard', 'common']);
  const user = useUser();
  const count = (...statuses: MeetingStatus[]) =>
    meetings.filter((meeting) => statuses.includes(meeting.status)).length;
  const sorted = [...meetings].sort(newestFirst);
  const attention = sorted.filter((meeting) => ATTENTION.includes(meeting.status));
  const hint = (status: MeetingStatus) =>
    status === 'ready' ? t('attention.ready') : status === 'approved' ? t('attention.approved') : t('attention.failed');

  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
        <Stat label={t('stats.drafts')} value={count('ready')} icon={IconPencil} color="orange" />
        <Stat
          label={t('stats.inProgress')}
          value={meetings.filter((meeting) => isProcessing(meeting.status)).length}
          icon={IconClockHour4}
          color="blue"
        />
        <Stat label={t('stats.toSend')} value={count('approved')} icon={IconChecks} color="teal" />
        <Stat label={t('stats.sent')} value={count('sent')} icon={IconMailForward} color="green" />
      </SimpleGrid>
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: user.role === 'admin' ? 8 : 12 }}>
          <Stack gap="md">
            <Section title={t('attention.title')}>
              {attention.length ? (
                <Stack gap={0}>
                  {attention.slice(0, RECENT).map((meeting) => (
                    <MeetingRow key={meeting.id} meeting={meeting} hint={hint(meeting.status)} />
                  ))}
                </Stack>
              ) : (
                <Group gap="xs">
                  <IconChecks size={16} color="var(--mantine-color-teal-6)" />
                  <Text size="sm" c="dimmed">
                    {t('attention.empty')}
                  </Text>
                </Group>
              )}
            </Section>
            <Section
              title={t('recent.title')}
              action={
                <Anchor component={Link} to="/meetings" size="sm">
                  {t('recent.all')}
                </Anchor>
              }
            >
              {sorted.length ? (
                <Stack gap={0}>
                  {sorted.slice(0, RECENT).map((meeting) => (
                    <MeetingRow key={meeting.id} meeting={meeting} />
                  ))}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  {t('recent.empty')}
                </Text>
              )}
            </Section>
          </Stack>
        </Grid.Col>
        {user.role === 'admin' && (
          <Grid.Col span={{ base: 12, md: 4 }}>
            <AdminSummary />
          </Grid.Col>
        )}
      </Grid>
    </Stack>
  );
}

function ReceivedDashboard({ meetings }: { meetings: Meeting[] }) {
  const { t } = useTranslation(['dashboard', 'my']);
  const sent = [...meetings].sort((a, b) => (b.sent_at ?? '').localeCompare(a.sent_at ?? ''));
  return (
    <Section
      title={t('received.title')}
      action={
        <Anchor component={Link} to="/my-minutes" size="sm">
          {t('received.all')}
        </Anchor>
      }
    >
      {sent.length ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {sent.slice(0, RECENT).map((meeting) => (
            <Card key={meeting.id} withBorder component={Link} to={`/my-minutes/${meeting.id}`}>
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <ThemeIcon variant="light" radius="md">
                  <IconFileText size={18} />
                </ThemeIcon>
                <Stack gap={2} miw={0}>
                  <Text size="sm" fw={600} lineClamp={2}>
                    {meeting.title || t('my:untitled')}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t('my:sent', { date: formatDateTime(meeting.sent_at), name: meeting.created_by.full_name })}
                  </Text>
                </Stack>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      ) : (
        <Text size="sm" c="dimmed">
          {t('my:emptyDescription')}
        </Text>
      )}
    </Section>
  );
}

/** The start page of every role: what needs doing and the latest meetings (for an admin, also the accounts). */
export function DashboardPage() {
  const user = useUser();
  const meetings = useMeetings();
  const greeting = useGreeting();
  const staff = user.role !== 'user';

  return (
    <>
      <PageHeader title={greeting.title} description={greeting.date} />
      {meetings.isPending ? (
        <LoadingState />
      ) : meetings.isError ? (
        <ErrorState error={meetings.error} onRetry={() => void meetings.refetch()} />
      ) : staff ? (
        <StaffDashboard meetings={meetings.data} />
      ) : (
        <ReceivedDashboard meetings={meetings.data} />
      )}
    </>
  );
}
