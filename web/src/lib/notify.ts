/** Toasts for errors and confirmations. */
import { notifications } from '@mantine/notifications';

import { ApiError, isAbortError } from '../api/client';
import i18n from '../i18n';

/** Shows the server's message; the same message is not stacked twice (polling). */
export function notifyError(error: unknown): void {
  if (isAbortError(error) || (error instanceof ApiError && error.status === 401)) return;
  const message = error instanceof Error ? error.message : i18n.t('state.somethingWrong');
  notifications.show({ id: `error:${message}`, color: 'red', title: i18n.t('state.error'), message });
}

export function notifySuccess(message: string): void {
  notifications.show({ color: 'teal', message });
}
