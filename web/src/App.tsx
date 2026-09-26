import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { ApiError } from './api/client';
import type { Role } from './api/types';
import { AuthProvider } from './auth/AuthProvider';
import { RequireRole } from './auth/RequireRole';
import { AppLayout } from './components/AppLayout';
import { notifyError } from './lib/notify';
import { CHANGE_PASSWORD_PATH } from './lib/roles';
import { AuditPage } from './pages/admin/AuditPage';
import { ListsPage } from './pages/admin/ListsPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { HomeRedirect } from './pages/HomeRedirect';
import { LoginPage } from './pages/LoginPage';
import { MeetingPage } from './pages/meetings/MeetingPage';
import { MeetingsPage } from './pages/meetings/MeetingsPage';
import { NewMeetingPage } from './pages/meetings/NewMeetingPage';
import { MyMinutesPage } from './pages/my/MyMinutesPage';
import { ReceivedMinutesPage } from './pages/my/ReceivedMinutesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RouteErrorPage } from './pages/RouteErrorPage';
import { theme } from './theme';

const STAFF: Role[] = ['admin', 'moderator'];
const MAX_RETRIES = 2;
const STALE_MS = 10_000;

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
  {
    element: <RequireRole />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomeRedirect /> },
          { path: CHANGE_PASSWORD_PATH, element: <ChangePasswordPage /> },
          {
            element: <RequireRole roles={STAFF} />,
            children: [
              { path: 'meetings', element: <MeetingsPage /> },
              { path: 'meetings/new', element: <NewMeetingPage /> },
              { path: 'meetings/:id', element: <MeetingPage /> },
            ],
          },
          {
            element: <RequireRole roles={['user']} />,
            children: [
              { path: 'my-minutes', element: <MyMinutesPage /> },
              { path: 'my-minutes/:id', element: <ReceivedMinutesPage /> },
            ],
          },
          {
            element: <RequireRole roles={['admin']} />,
            children: [
              { path: 'admin/users', element: <UsersPage /> },
              { path: 'admin/lists', element: <ListsPage /> },
              { path: 'admin/settings', element: <SettingsPage /> },
              { path: 'admin/audit', element: <AuditPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

/** Client errors (4xx) are answers, not glitches: only network and server errors are retried. */
function shouldRetry(failures: number, error: Error): boolean {
  const clientError = error instanceof ApiError && error.status >= 400 && error.status < 500;
  return !clientError && failures < MAX_RETRIES;
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      // A failed first load is shown on the page; a failed refresh of data on screen gets a toast.
      onError: (error, query) => {
        if (query.state.data !== undefined) notifyError(error);
      },
    }),
    mutationCache: new MutationCache({ onError: notifyError }),
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: STALE_MS },
      mutations: { retry: false },
    },
  });
}

export function App() {
  const [queryClient] = useState(createQueryClient);
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" limit={4} />
      <QueryClientProvider client={queryClient}>
        <ModalsProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
}
