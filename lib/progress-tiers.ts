export type ProgressTierDefinition = { label: string; threshold: number };

// "Einsteiger" always shows first (threshold 0) -- there's no minimum count
// gating the badge itself, unlike the expertise labels, which only appear
// once earned. Thresholds counted are total interaction_credits-free
// item_interactions rows (like + dislike, never watchlist/skip -- see
// lib/progress-tiers.ts's caller in app/u/[username]/page.tsx).
export const MOVIE_PROGRESS_TIERS: ProgressTierDefinition[] = [
  { label: "Einsteiger", threshold: 0 },
  { label: "Filmkenner", threshold: 20 },
  { label: "Experte", threshold: 50 },
];

export const PLACE_PROGRESS_TIERS: ProgressTierDefinition[] = [
  { label: "Einsteiger", threshold: 0 },
  { label: "Ortskenner", threshold: 20 },
  { label: "Local Experte", threshold: 50 },
];

export type ResolvedProgressTier = {
  current: ProgressTierDefinition;
  /** null once the count has cleared the highest tier -- there's nothing further to progress toward. */
  next: ProgressTierDefinition | null;
  /** 0..1, always 1 when `next` is null. */
  progressFraction: number;
};

export function resolveProgressTier(
  count: number,
  tiers: ProgressTierDefinition[],
): ResolvedProgressTier {
  let current = tiers[0];
  let next: ProgressTierDefinition | null = null;

  for (const tier of tiers) {
    if (count >= tier.threshold) {
      current = tier;
    } else {
      next = tier;
      break;
    }
  }

  const progressFraction = next
    ? Math.min(1, (count - current.threshold) / (next.threshold - current.threshold))
    : 1;

  return { current, next, progressFraction };
}
