/** Roles: their colors and labels (in the app's language), the start page and the page to change a password. */
import type { MantineColor } from '@mantine/core';

import type { Role } from '../api/types';
import i18n from '../i18n';

export const ROLE_VALUES: Role[] = ['admin', 'moderator', 'user'];

export const ROLE_COLORS: Record<Role, MantineColor> = { admin: 'red', moderator: 'blue', user: 'gray' };

export function roleLabel(role: Role): string {
  return i18n.t(`role.${role}`);
}

export function roleDescription(role: Role): string {
  return i18n.t(`roleDescription.${role}`);
}

export const CHANGE_PASSWORD_PATH = '/change-password';

/** Everyone starts on the dashboard. */
export function homePath(): string {
  return '/';
}
