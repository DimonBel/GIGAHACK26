/** Display formats for dates, durations and sizes. */

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const EMPTY = '—';
const KILOBYTE = 1024;
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'];

const pad = (value: number) => String(value).padStart(2, '0');

/** "26 Sep 2026, 18:00" in the browser's time zone. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return EMPTY;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME.format(date);
}

/** Position in a recording: "04:12", or "1:02:05" past an hour. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const clock = `${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return hours ? `${hours}:${clock}` : clock;
}

/** Length for people: "45 s", "11 min 43 s", "1 h 02 min". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return EMPTY;
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours} h ${pad(minutes)} min`;
  if (minutes) return `${minutes} min ${pad(total % 60)} s`;
  return `${total} s`;
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
