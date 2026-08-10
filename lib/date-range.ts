/**
 * lib/date-range.ts
 *
 * Timezone-correct calendar-day boundaries for admin date filters and exports.
 *
 * The problem this solves: admin UIs send a plain `YYYY-MM-DD`, and the old
 * code did `new Date("2026-08-07")` (which parses as UTC midnight) then
 * `.setHours(23,59,59,999)` (which applies the *server's* timezone — UTC on
 * Vercel). So the query window was a UTC day while the admin had picked a date
 * on their own calendar. For an IST admin, "today" silently excluded
 * 00:00–05:30 IST and included 00:00–05:30 of the next day. `dateFrom` got no
 * equivalent treatment at all, so the two ends were inconsistent with each
 * other.
 *
 * Fixed by resolving both ends in an explicit REPORTING timezone rather than
 * whatever the server or viewer happens to be in. A fixed reporting timezone
 * (not the viewer's) is the right choice for a business: two admins in
 * different countries looking at "August 7" must see the same numbers.
 *
 * Unlike the previous fixed `5.5 * 60 * 60 * 1000` offset, this resolves the
 * offset *at the instant in question*, so it stays correct for DST zones if
 * the reporting timezone is ever changed away from IST.
 */

/**
 * Timezone all admin date filters and exported timestamps are expressed in.
 * Defaults to IST, preserving the behaviour the reports were built around.
 */
export const REPORTING_TIMEZONE = process.env.REPORTING_TIMEZONE || "Asia/Kolkata";

/**
 * Short label for the reporting zone, e.g. "GMT+5:30" — used to stamp exported
 * timestamp columns so a reader in another country knows what they're seeing.
 */
export function reportingTimezoneLabel(at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: REPORTING_TIMEZONE,
      timeZoneName: "shortOffset",
    }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? REPORTING_TIMEZONE;
  } catch {
    return REPORTING_TIMEZONE;
  }
}

/** Milliseconds `timeZone` is ahead of UTC at the given instant. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    // Intl can emit hour 24 for midnight under hour12:false.
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/** Parses `YYYY-MM-DD`, returning null for anything malformed. */
function parseYmd(ymd: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  return [Number(y), Number(m), Number(d)];
}

/**
 * The UTC instant at which the given calendar day begins in `timeZone`.
 * Returns null when `ymd` is not a valid YYYY-MM-DD.
 */
export function startOfDayUtc(ymd: string, timeZone = REPORTING_TIMEZONE): Date | null {
  const parsed = parseYmd(ymd);
  if (!parsed) return null;
  const [y, m, d] = parsed;

  const wallClock = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  // First pass with the offset near the target, then re-resolve at the computed
  // instant so DST transitions land on the correct side.
  const firstPass = wallClock - tzOffsetMs(new Date(wallClock), timeZone);
  const refined = wallClock - tzOffsetMs(new Date(firstPass), timeZone);
  return new Date(refined);
}

/** The last representable instant of the given calendar day in `timeZone`. */
export function endOfDayUtc(ymd: string, timeZone = REPORTING_TIMEZONE): Date | null {
  const start = startOfDayUtc(ymd, timeZone);
  if (!start) return null;

  // Start of the *next* day minus 1ms, rather than start + 24h — a DST spring
  // forward makes some local days 23 hours long.
  const next = new Date(start.getTime() + 36 * 60 * 60 * 1000);
  const nextYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(next);
  const nextStart = startOfDayUtc(nextYmd, timeZone);
  if (!nextStart) return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return new Date(nextStart.getTime() - 1);
}

/** ISO string for the start of `ymd`, or null. Convenience for query builders. */
export function startOfDayIso(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  return startOfDayUtc(ymd)?.toISOString() ?? null;
}

/** ISO string for the end of `ymd`, or null. Convenience for query builders. */
export function endOfDayIso(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  return endOfDayUtc(ymd)?.toISOString() ?? null;
}

/**
 * Shifts a UTC timestamp so its UTC parts read as reporting-timezone wall
 * clock — the form spreadsheet date cells need, since Excel stores a naive
 * serial number with no timezone.
 *
 * Replaces a hardcoded `+5.5h` constant. Resolving the offset at the actual
 * instant means this stays correct across DST if REPORTING_TIMEZONE is ever
 * changed to a zone that observes it.
 *
 * The returned Date is a display artifact, NOT a real instant — never compare
 * or persist it.
 */
export function toReportingWallClock(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + tzOffsetMs(date, REPORTING_TIMEZONE));
}

/**
 * Formats a UTC timestamp as `YYYY-MM-DD HH:mm` wall-clock in the reporting
 * timezone. Used by exports, which must not emit bare local-looking times.
 */
export function formatInReportingTz(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORTING_TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}`;
}
