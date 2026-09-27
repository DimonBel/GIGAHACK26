import { Navigate, Outlet, useLocation } from 'react-router';

import type { Role } from '../api/types';
import { CHANGE_PASSWORD_PATH, homePath } from '../lib/roles';
import { useAuth } from './context';

/** Renders the child routes for the given roles; others go to their start page, anonymous users to login
 *  (which brings them back here, unless they just signed out). A user whose password an admin chose sees only
 *  the change-password page until they choose their own. */
export function RequireRole({ roles }: { roles?: Role[] }) {
  const { user, signedOut } = useAuth();
  const location = useLocation();
  if (!user) {
    const from = `${location.pathname}${location.search}`;
    return <Navigate to="/login" replace state={signedOut ? undefined : { from }} />;
  }
  if (user.must_change_password && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to={homePath()} replace />;
  return <Outlet />;
}
