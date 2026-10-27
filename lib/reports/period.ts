// Report periods use the workspace timezone (FR-REP-02): a month runs from
// local midnight on the 1st to local midnight on the 1st of the next month.

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export type LocalParts = { year: number; month: number; day: number; hour: number; minute: number };

export function localParts(at: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** Offset of `timeZone` from UTC at `at`, in ms (positive east of Greenwich). */
function offsetMs(at: Date, timeZone: string): number {
  const p = localParts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(at.getTime() / 60_000) * 60_000;
}

/** The UTC instant of a local wall-clock time (DST-safe for whole hours). */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour);
  const first = guess - offsetMs(new Date(guess), timeZone);
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

export type Period = { start: Date; end: Date; label: string; year: number; month: number; days: number };

export function monthPeriod(year: number, month: number, timeZone: string): Period {
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return {
    start: zonedTimeToUtc(year, month, 1, 0, timeZone),
    end: zonedTimeToUtc(next.y, next.m, 1, 0, timeZone),
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    year,
    month,
    days: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

export function previousMonth(now: Date, timeZone: string): Period {
  const p = localParts(now, timeZone);
  return p.month === 1 ? monthPeriod(p.year - 1, 12, timeZone) : monthPeriod(p.year, p.month - 1, timeZone);
}

export function currentMonth(now: Date, timeZone: string): Period {
  const p = localParts(now, timeZone);
  return monthPeriod(p.year, p.month, timeZone);
}

export function monthName(month: number) {
  return MONTH_NAMES[month - 1];
}
