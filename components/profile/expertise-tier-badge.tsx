"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import type { ExpertiseTier } from "@/lib/expertise-tiers";

const TIER_LABEL: Record<ExpertiseTier, string> = {
  einsteiger: "Einsteiger",
  kenner: "Kenner",
  experte: "Experte",
};

/**
 * Icon + tier word attached directly to a category/Orte row's title
 * (Runde 2, Punkt 4: the word itself must be visible to everyone, not
 * just implied by the icon) -- replaces the removed aggregated
 * "Experte · 65 Filme" pill row. Einsteiger renders nothing (badges
 * should feel earned, not given from item #1). Numeric progress
 * ("42/60 bis Experte") stays owner-only, via tap.
 */
export function ExpertiseTierBadge({
  tier,
  progressLabel,
}: {
  tier: ExpertiseTier;
  progressLabel?: string | null;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (tier === "einsteiger") return null;

  const content = (
    <span className="inline-flex items-center gap-0.5">
      {tier === "experte" ? (
        <Star className="size-3.5 fill-current text-yellow-500" />
      ) : (
        <Star className="size-3.5 text-amber-700" />
      )}
      <span className="text-[10px] font-medium text-muted-foreground">{TIER_LABEL[tier]}</span>
    </span>
  );

  if (!progressLabel) {
    return (
      <span className="shrink-0" aria-label={TIER_LABEL[tier]}>
        {content}
      </span>
    );
  }

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-label={`${TIER_LABEL[tier]}: ${progressLabel}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setShowTooltip((prev) => !prev);
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="flex items-center justify-center"
      >
        {content}
      </button>
      {showTooltip && (
        <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap rounded bg-foreground text-background text-[10px] px-2 py-1 z-20">
          {progressLabel}
        </span>
      )}
    </span>
  );
}
