/** Display formats for dates, durations and sizes, in the app's language. */
import i18n, { locale } from '../i18n';

const EMPTY = '—';
const KILOBYTE = 1024;
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'];

const pad = (value: number) => String(value).padStart(2, '0');

/** "26 Sep 2026, 18:00" ("26 sept. 2026, 18:00", "26 сент. 2026 г., 18:00") in the browser's time zone. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** "Saturday 26 September" for a greeting, capitalized in every language ("Duminică, 27 septembrie"). */
export function formatDay(date: Date): string {
  const day = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  return day.charAt(0).toLocaleUpperCase(locale()) + day.slice(1);
}

/** Position in a recording: "04:12", or "1:02:05" past an hour. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const clock = `${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return hours ? `${hours}:${clock}` : clock;
}

/** Length for people: "45 s", "11 min 43 s", "1 h 02 min" (units in the app's language). */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return EMPTY;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return i18n.t('duration.hours', { h: hours, m: pad(minutes) });
  if (minutes) return i18n.t('duration.minutes', { m: minutes, s: pad(total % 60) });
  return i18n.t('duration.seconds', { s: total });
}

/** File size: "870 KB", "12.3 MB". */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= KILOBYTE && unit < SIZE_UNITS.length - 1) {
    value /= KILOBYTE;
    unit += 1;
  }
  return `${value.toFixed(unit >= 2 ? 1 : 0)} ${SIZE_UNITS[unit]}`;
}

/** "Ana Maria Popescu" -> "AM", for avatars. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}
