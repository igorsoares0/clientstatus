// "Last updated <date>" for marketing pages. Dates are ISO (YYYY-MM-DD) strings from the data files
// and are formatted in UTC so the build machine's time zone can't shift them by a day.

function parse(iso: string): Date {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${iso}`);
  return date;
}

/** "November 22, 2026" */
export function formatDay(iso: string): string {
  return parse(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

/** "November 2026", for "Information as of …" on competitor pages. */
export function formatMonth(iso: string): string {
  return parse(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" });
}

export function UpdatedAt({ date, label = "Last updated" }: { date: string; label?: string }) {
  return (
    <p className="m-0 text-[12.5px] text-muted">
      {label} <time dateTime={parse(date).toISOString().slice(0, 10)}>{formatDay(date)}</time>
    </p>
  );
}
