"use client";

import { useState } from "react";
import { MapPin, Star, type LucideIcon } from "lucide-react";
import {
  resolveProgressTier,
  MOVIE_PROGRESS_TIERS,
  PLACE_PROGRESS_TIERS,
} from "@/lib/progress-tiers";

const RING_SIZE = 20;
const RING_STROKE = 2;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function ProgressRing({ fraction }: { fraction: number }) {
  const offset = RING_CIRCUMFERENCE * (1 - fraction);
  return (
    <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90 shrink-0">
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        strokeWidth={RING_STROKE}
        className="stroke-muted"
        fill="none"
      />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        strokeWidth={RING_STROKE}
        className="stroke-primary transition-[stroke-dashoffset]"
        fill="none"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProgressBadge({
  icon: Icon,
  count,
  unit,
  showRing,
}: {
  icon: LucideIcon;
  count: number;
  unit: "Filme" | "Orte";
  showRing: boolean;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tiers = unit === "Filme" ? MOVIE_PROGRESS_TIERS : PLACE_PROGRESS_TIERS;
  const { current, next, progressFraction } = resolveProgressTier(count, tiers);

  const tooltipText = next
    ? `${count} von ${next.threshold} bis ${next.label}`
    : "Maximale Stufe erreicht";

  return (
    <div className="relative inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {showRing ? (
        <button
          type="button"
          aria-label={`Fortschritt: ${tooltipText}`}
          onClick={() => setShowTooltip((prev) => !prev)}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className="relative flex items-center justify-center"
        >
          <ProgressRing fraction={progressFraction} />
          <Icon className="absolute size-2.5 text-primary" />
        </button>
      ) : (
        <Icon className="size-4" />
      )}
      <span>
        {current.label} · {count} {unit}
      </span>
      {showRing && showTooltip && (
        <span className="absolute top-full left-0 mt-1 whitespace-nowrap rounded bg-foreground text-background text-[10px] px-2 py-1 z-10">
          {tooltipText}
        </span>
      )}
    </div>
  );
}

/**
 * Two independent progress rows -- movies and places -- driven purely by
 * item_interactions counts (like + dislike, never watchlist/Merken/skip).
 * The label ("Filmkenner · 20 Filme") is visible to every profile visitor;
 * the ring + hover/click tooltip around the icon is owner-only (`showRing`),
 * per spec -- visitors see the same text with a plain icon, no progress UI.
 */
export function ProgressBadges({
  movieCount,
  placeCount,
  showRing,
}: {
  movieCount: number;
  placeCount: number;
  showRing: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
      <ProgressBadge icon={Star} count={movieCount} unit="Filme" showRing={showRing} />
      <ProgressBadge icon={MapPin} count={placeCount} unit="Orte" showRing={showRing} />
    </div>
  );
}
