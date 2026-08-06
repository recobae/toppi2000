/**
 * The instant local midnight (start of "today") falls at in the given IANA
 * time zone, expressed as a real UTC-backed Date -- not the server's own
 * local time zone (Vercel functions run in UTC, which would put the daily
 * boundary several hours off for a German audience). Recomputes the
 * zone's current offset from `now` on every call, so it stays correct
 * across DST changes without a lookup table.
 */
export function startOfTodayInTimeZone(timeZone: string, now: Date = new Date()): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour === "24" ? "0" : parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);

  // The zone's wall-clock "now", read as if it were UTC, minus the actual
  // UTC instant "now" represents -- the difference is the zone's current
  // offset (positive east of UTC, e.g. +1h/+2h for Europe/Berlin).
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMs = wallClockAsUtc - now.getTime();

  const localMidnightAsUtcWallClock = Date.UTC(year, month - 1, day, 0, 0, 0);
  return new Date(localMidnightAsUtcWallClock - offsetMs);
}
