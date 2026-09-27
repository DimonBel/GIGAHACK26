/** The signed-in user and the login / logout / password actions. */
import { createContext, useContext } from 'react';

import type { User } from '../api/types';

export interface AuthContextValue {
  user: User | null;
  /** The user signed out on purpose (not an expired session or a first visit). */
  signedOut: boolean;
  login: (email: string, password: string) => Promise<User>;
  /** Ends the session; never fails. */
  logout: () => Promise<void>;
  /** Sets the user's own password (their other sessions end); returns the user, no longer asked to change it. */
  changePassword: (current: string, next: string) => Promise<User>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** The signed-in user, for pages that are only reachable behind a guard. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser needs a signed-in user');
  return user;
}
