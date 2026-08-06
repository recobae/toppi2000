"use client";

import Image from "next/image";
import { Sparkles } from "lucide-react";
import type { DiscoveryCandidate } from "@/lib/discovery";

/**
 * "A vs. B" -- two real, likeable items of the same type, side by side.
 * Tapping one is unambiguous: that side becomes Gefällt mir, the other
 * becomes Nix für mich (never left unrated -- the UI makes that meaning
 * explicit via the "vs" framing and labelled buttons, not a bare tap).
 * Abstract theme battles ("Bar oder Club") were deliberately left out --
 * there's no real, save-able item on the losing side for those, so a
 * "Nix für mich" there would have nothing to attach to.
 */
export function BattleCard({
  a,
  b,
  onChoose,
  disabled,
}: {
  a: DiscoveryCandidate;
  b: DiscoveryCandidate;
  onChoose: (winner: "a" | "b") => void;
  disabled?: boolean;
}) {
  const side = (candidate: DiscoveryCandidate, key: "a" | "b") => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChoose(key)}
      className="relative h-full w-1/2 overflow-hidden rounded-2xl bg-muted shadow-xl disabled:opacity-70 transition-opacity"
      aria-label={`${candidate.title} -- Gefällt mir`}
    >
      {candidate.imageUrl ? (
        <Image src={candidate.imageUrl} alt={candidate.title} fill sizes="192px" className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Sparkles className="size-6 opacity-40" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 pt-10 text-white">
        <p className="text-sm font-semibold leading-tight line-clamp-2">{candidate.title}</p>
        <p className="text-[11px] text-white/70">{candidate.category}</p>
      </div>
    </button>
  );

  return (
    <div className="relative h-full w-full flex items-center gap-1.5">
      {side(a, "a")}
      <span className="absolute left-1/2 top-1/2 z-10 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background text-xs font-bold shadow-lg border">
        vs
      </span>
      {side(b, "b")}
    </div>
  );
}
