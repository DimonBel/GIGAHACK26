import { useReducedMotion } from '@mantine/hooks';
import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 600;

/** Animates a number from its previous value to the next one; jumps straight there with reduced motion. */
export function useCountUp(value: number): number {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || value === from.current) {
      from.current = value;
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const startValue = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      setDisplay(Math.round(startValue + (value - startValue) * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    from.current = value;
    return () => cancelAnimationFrame(frame);
  }, [value, reducedMotion]);

  return display;
}
