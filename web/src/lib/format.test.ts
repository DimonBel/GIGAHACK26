import { describe, expect, it } from 'vitest';

import { formatBytes, formatClock, formatDuration } from './format';

describe('format', () => {
  it('writes recording positions as a clock', () => {
    expect(formatClock(3.1)).toBe('00:03');
    expect(formatClock(252)).toBe('04:12');
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('writes durations for people', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(703.2)).toBe('11 min 43 s');
    expect(formatDuration(3720)).toBe('1 h 02 min');
    expect(formatDuration(null)).toBe('—');
  });

  it('writes file sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(870 * 1024)).toBe('870 KB');
    expect(formatBytes(12.3 * 1024 * 1024)).toBe('12.3 MB');
  });
});
