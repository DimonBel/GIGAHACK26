import { useEffect, useRef, useState } from 'react';

import type { MeetingStatus } from '../api/types';
import { isProcessing } from '../lib/meeting';

/** How long the processing card's success beat plays before the caller swaps it for the minutes. */
const SUCCESS_HOLD_MS = 1300;

/**
 * True right after a meeting stops being queued/processing (until the success beat above has had time to play),
 * so the page can keep the processing card mounted a little longer instead of cutting straight to the minutes.
 * `status` is `undefined` while the meeting hasn't loaded yet; nothing is held in that case.
 */
export function useSuccessHold(status: MeetingStatus | undefined): boolean {
  const [holding, setHolding] = useState(false);
  const wasProcessing = useRef(false);

  useEffect(() => {
    if (status === undefined) return;
    const justFinished = wasProcessing.current && !isProcessing(status);
    wasProcessing.current = isProcessing(status);
    if (!justFinished || status === 'failed') return;
    setHolding(true);
    const timer = window.setTimeout(() => setHolding(false), SUCCESS_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  return holding;
}
