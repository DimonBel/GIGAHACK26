import { Button, Group, Modal, Text } from '@mantine/core';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker } from 'react-router';

/**
 * Asks before leaving the page (another route or closing the tab) while `when` is true.
 * Returns the question's modal to render, and release() to let the page's own next navigation through.
 */
export function useLeaveGuard(when: boolean, message: string) {
  const { t } = useTranslation();
  const released = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && !released.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!when) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  const release = useCallback(() => {
    released.current = true;
  }, []);

  const modal = (
    <Modal opened={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title={t('leave.title')} centered>
      <Text size="sm">{message}</Text>
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={() => blocker.reset?.()}>
          {t('leave.stay')}
        </Button>
        <Button color="red" onClick={() => blocker.proceed?.()}>
          {t('leave.leave')}
        </Button>
      </Group>
    </Modal>
  );

  return { release, modal };
}
