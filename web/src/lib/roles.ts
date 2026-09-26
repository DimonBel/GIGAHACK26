/** Role labels, colors, each role's start page and the page for a password to change. */
import type { MantineColor } from '@mantine/core';

import type { Role } from '../api/types';

export const ROLES: { value: Role; label: string; description: string }[] = [
  { value: 'admin', label: 'Administrator', description: 'Users, distribution lists, settings, audit log' },
  { value: 'moderator', label: 'Moderator', description: 'Records meetings, approves and sends minutes' },
  { value: 'user', label: 'User', description: 'Reads the minutes sent to them' },
];

export const ROLE_COLORS: Record<Role, MantineColor> = { admin: 'red', moderator: 'blue', user: 'gray' };

export function roleLabel(role: Role): string {
  return ROLES.find((option) => option.value === role)?.label ?? role;
}

export const CHANGE_PASSWORD_PATH = '/change-password';

export function homePath(role: Role): string {
  return role === 'user' ? '/my-minutes' : '/meetings';
}
