/**
 * Every date in this app is an India date, never a server date.
 *
 * Vercel runs functions in UTC. If we asked JavaScript for "today" directly,
 * the app would roll over to a new day at 5:30 AM IST and the family would
 * lose the dinner they voted on at 11 PM the night before.
 */
export const TZ = "Asia/Kolkata";

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  hourCycle: "h23",
});

const labelFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "short",
});

/** "2026-07-27" for today in India, or +1 for tomorrow. */
export function istDateKey(offsetDays = 0, now: Date = new Date()): string {
  const ymd = ymdFormatter.format(now);
  const anchor = new Date(`${ymd}T00:00:00Z`);
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays);
  return anchor.toISOString().slice(0, 10);
}

/** 0–23, in India. */
export function istHour(now: Date = new Date()): number {
  return Number(hourFormatter.format(now));
}

/** "Monday, 27 Jul" — for the header. */
export function humanDate(dateKey: string): string {
  return labelFormatter.format(new Date(`${dateKey}T06:00:00Z`));
}

/** Only today and tomorrow are writable. Guards against junk keys in Redis. */
export function isAllowedDateKey(value: unknown): value is string {
  return value === istDateKey(0) || value === istDateKey(1);
}
