// Date/time formatting in the workspace timezone. Timestamps are stored in UTC
// and only converted for display (spec §7.2).

export function formatClock(date: Date, timeZone: string, withSeconds = true): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hourCycle: "h23",
  }).format(date);
}

/** Short zone label for a given moment, e.g. "GMT", "BST", "GMT-3". */
export function timeZoneAbbreviation(timeZone: string, at: Date): string {
  const part = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

// Fixed month names: ICU versions disagree ("Sep" vs "Sept"); the design uses three letters.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { day: get("day"), month: MONTHS[get("month") - 1], year: get("year") };
}

/** "25 Oct" in the workspace timezone; adds the year when it isn't the current one. */
export function formatShortDate(date: Date, timeZone: string, now = new Date()): string {
  const d = dateParts(date, timeZone);
  return d.year === dateParts(now, timeZone).year ? `${d.day} ${d.month}` : `${d.day} ${d.month} ${d.year}`;
}

/** "13 Aug 2027" — always with the year. */
export function formatLongDate(date: Date, timeZone: string): string {
  const d = dateParts(date, timeZone);
  return `${d.day} ${d.month} ${d.year}`;
}

/** "Oct 2026" — used for "client since". */
export function formatMonthYear(date: Date, timeZone: string): string {
  const d = dateParts(date, timeZone);
  return `${d.month} ${d.year}`;
}

/** "Priya Raman" → "Priya R." */
export function shortPersonName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
