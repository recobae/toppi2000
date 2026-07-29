// Weekly-recurring opening periods, as returned by Places API (New)'s
// regularOpeningHours.periods -- day-of-week + time-of-day, NOT bound to a
// specific date, so this stays correct indefinitely for a saved place
// (unlike currentOpeningHours, which is date-bound and would go stale).
export type OpeningPeriod = {
  open: { day: number; hour: number; minute: number };
  close: { day: number; hour: number; minute: number } | null;
};

export type OpeningStatus = {
  openNow: boolean;
  /** e.g. "bis 23:00 Uhr" or "ab 09:00 Uhr" -- empty if unknown. */
  changeLabel: string;
};

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

function toAbsMinutes(point: { day: number; hour: number; minute: number }): number {
  return point.day * MINUTES_PER_DAY + point.hour * 60 + point.minute;
}

function formatHHMM(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Computes "open now" / "closes at" / "opens at" fresh, at call time, from a
 * place's recurring weekly schedule -- so it's always correct for "right
 * now", regardless of when the place was saved to a list.
 */
export function computeOpeningStatus(
  periods: OpeningPeriod[] | null | undefined,
  utcOffsetMinutes: number | null | undefined,
): OpeningStatus | null {
  if (!periods || periods.length === 0 || utcOffsetMinutes == null) return null;

  const localNow = new Date(Date.now() + utcOffsetMinutes * 60000);
  const nowAbs =
    localNow.getUTCDay() * MINUTES_PER_DAY +
    localNow.getUTCHours() * 60 +
    localNow.getUTCMinutes();

  type Interval = {
    openAbs: number;
    closeAbs: number;
    openPoint: { hour: number; minute: number };
    closePoint: { hour: number; minute: number };
  };

  const intervals: Interval[] = [];
  for (const period of periods) {
    if (!period.close) continue; // open 24h that day -- no meaningful "closes at" to show
    const openAbs = toAbsMinutes(period.open);
    let closeAbs = toAbsMinutes(period.close);
    if (closeAbs <= openAbs) closeAbs += MINUTES_PER_WEEK;

    // Each period is added twice, one week apart, so a period that opened
    // "last week" (e.g. Saturday night into Sunday morning) still matches
    // when "now" has wrapped to early in the new week.
    for (const shift of [0, -MINUTES_PER_WEEK]) {
      intervals.push({
        openAbs: openAbs + shift,
        closeAbs: closeAbs + shift,
        openPoint: period.open,
        closePoint: period.close,
      });
    }
  }

  const active = intervals.find((iv) => nowAbs >= iv.openAbs && nowAbs < iv.closeAbs);
  if (active) {
    return {
      openNow: true,
      changeLabel: `bis ${formatHHMM(active.closePoint.hour, active.closePoint.minute)} Uhr`,
    };
  }

  const next = intervals
    .filter((iv) => iv.openAbs >= nowAbs)
    .sort((a, b) => a.openAbs - b.openAbs)[0];

  if (!next) return { openNow: false, changeLabel: "" };

  return {
    openNow: false,
    changeLabel: `ab ${formatHHMM(next.openPoint.hour, next.openPoint.minute)} Uhr`,
  };
}
