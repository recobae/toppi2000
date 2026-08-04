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
 * Small icon attached directly to a category/Orte row's title (Design-
 * Iteration 2, Punkt 3) -- replaces the separate expertise-pill row.
 * Einsteiger renders nothing (badges should feel earned, not given from
 * item #1). Progress ("42/60 bis Experte") only ever passed in for the
 * profile owner -- visitors get the bare icon, no numbers.
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

  const icon =
    tier === "experte" ? (
      <Star className="size-3.5 fill-current text-yellow-500" />
    ) : (
      <Star className="size-3.5 text-amber-700" />
    );

  if (!progressLabel) {
    return (
      <span className="shrink-0" aria-label={TIER_LABEL[tier]}>
        {icon}
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
        {icon}
      </button>
      {showTooltip && (
        <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap rounded bg-foreground text-background text-[10px] px-2 py-1 z-20">
          {progressLabel}
        </span>
      )}
    </span>
  );
}
