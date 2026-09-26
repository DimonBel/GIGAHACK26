import { Navigate } from 'react-router';

import { useUser } from '../auth/context';
import { homePath } from '../lib/roles';

export function HomeRedirect() {
  const user = useUser();
  return <Navigate to={homePath(user.role)} replace />;
}
