import { afterEach, describe, expect, it } from 'vitest';

import i18n from '../i18n';
import { formatBytes, formatClock, formatDay, formatDuration } from './format';

afterEach(() => void i18n.changeLanguage('en'));

describe('format', () => {
  it('writes the day of a greeting with a capital letter in every language', async () => {
    const sunday = new Date(2026, 8, 27, 10);
    expect(formatDay(sunday)).toBe('Sunday 27 September');
    await i18n.changeLanguage('ro');
    expect(formatDay(sunday)).toBe('Duminică, 27 septembrie');
    await i18n.changeLanguage('ru');
    expect(formatDay(sunday)).toBe('Воскресенье, 27 сентября');
  });

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
