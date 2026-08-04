export type ExpertiseTier = "einsteiger" | "kenner" | "experte";

type Thresholds = { kenner: number; experte: number };

/**
 * First-pass thresholds (Design-Iteration 2) -- not backed by real usage
 * data (no production DB access from this session to check actual
 * distribution), adjust here if they turn out too easy/hard to reach.
 * Content = Filme & Serien and any future non-place category; Orte are
 * evaluated per individual region/city list, never aggregated.
 */
export const CONTENT_TIER_THRESHOLDS: Thresholds = { kenner: 25, experte: 60 };
export const PLACE_TIER_THRESHOLDS: Thresholds = { kenner: 15, experte: 40 };

export function resolveExpertiseTier(count: number, thresholds: Thresholds): ExpertiseTier {
  if (count >= thresholds.experte) return "experte";
  if (count >= thresholds.kenner) return "kenner";
  return "einsteiger";
}

/** "42/60 bis Experte" -- null once already at the top tier (nothing left to progress toward). */
export function tierProgressLabel(count: number, thresholds: Thresholds): string | null {
  if (count >= thresholds.experte) return null;
  const atKenner = count >= thresholds.kenner;
  const target = atKenner ? thresholds.experte : thresholds.kenner;
  const targetLabel = atKenner ? "Experte" : "Kenner";
  return `${count}/${target} bis ${targetLabel}`;
}
