"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { likeAndSaveCandidate } from "@/lib/discovery-like";
import { dislikeCandidate } from "@/lib/discovery-dislike";
import { recordSwipeCardAction } from "@/lib/swipe-deck";
import { QuickSwipeCard } from "@/components/swipe/quick-swipe-card";
import { BattleCard } from "@/components/swipe/battle-card";
import type { QuickSwipeUnit } from "@/lib/quick-swipe";
import type { DiscoveryCandidate } from "@/lib/discovery";

const REFILL_THRESHOLD = 3;

type QuickSwipeResponse = { units: QuickSwipeUnit[]; exhausted: boolean; remaining: number | null };

function unitKey(unit: QuickSwipeUnit): string {
  return unit.kind === "single" ? unit.candidate.id : `${unit.a.id}|${unit.b.id}`;
}

function unitIds(unit: QuickSwipeUnit): string[] {
  return unit.kind === "single" ? [unit.candidate.id] : [unit.a.id, unit.b.id];
}

/**
 * My Taste's entire content: one focused unit (single card or Battle) at a
 * time, Gefällt mir / Nix für mich (or a Battle tap), immediately the next
 * unit. No filters, no categories, no notes, no list management, no social
 * feed elements -- those all belong in Für Dich or the Profil, never here
 * (Master-Audit round).
 */
export function QuickSwipeDeck({ userId }: { userId: string }) {
  const [units, setUnits] = useState<QuickSwipeUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [pending, setPending] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const fetchUnits = useCallback(async (): Promise<QuickSwipeResponse | null> => {
    const exclude = [...seenIdsRef.current].join(",");
    const response = await fetch(`/api/quick-swipe?exclude=${encodeURIComponent(exclude)}`);
    if (!response.ok) return null;
    return response.json();
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const data = await fetchUnits();
      if (data) {
        const fresh = data.units.filter((unit) => !unitIds(unit).some((id) => seenIdsRef.current.has(id)));
        for (const unit of fresh) for (const id of unitIds(unit)) seenIdsRef.current.add(id);
        setUnits(fresh);
        setRemaining(data.remaining);
        setExhausted(data.exhausted);
      }
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || exhausted || remaining === 0) return;
    setIsLoadingMore(true);
    const data = await fetchUnits();
    if (data) {
      const fresh = data.units.filter((unit) => !unitIds(unit).some((id) => seenIdsRef.current.has(id)));
      for (const unit of fresh) for (const id of unitIds(unit)) seenIdsRef.current.add(id);
      setUnits((prev) => [...prev, ...fresh]);
      setRemaining(data.remaining);
      if (data.exhausted) setExhausted(true);
    }
    setIsLoadingMore(false);
  }, [fetchUnits, isLoadingMore, exhausted, remaining]);

  useEffect(() => {
    if (isLoading || isLoadingMore || exhausted) return;
    if (remaining === 0) return;
    if (units.length < REFILL_THRESHOLD) loadMore();
  }, [units.length, isLoading, isLoadingMore, exhausted, remaining, loadMore]);

  const dismissCurrent = () => {
    setUnits((prev) => prev.slice(1));
    setRemaining((prev) => (prev === null ? null : Math.max(0, prev - 1)));
  };

  const decide = async (candidate: DiscoveryCandidate, action: "like" | "dislike") => {
    const supabase = createClient();
    if (action === "like") {
      await likeAndSaveCandidate(supabase, userId, candidate);
    } else {
      await dislikeCandidate(supabase, userId, candidate);
    }
    const { error: trackingError } = await recordSwipeCardAction(supabase, userId);
    if (trackingError) {
      // Quota tracking is supplementary -- the actual rating above already succeeded.
      console.error("quick swipe tracking failed", trackingError);
    }
  };

  const handleSingleAction = async (candidate: DiscoveryCandidate, action: "like" | "dislike") => {
    if (pending) return;
    setPending(true);
    await decide(candidate, action);
    dismissCurrent();
    setPending(false);
  };

  const handleBattleChoice = async (a: DiscoveryCandidate, b: DiscoveryCandidate, winner: "a" | "b") => {
    if (pending) return;
    setPending(true);
    const [chosen, other] = winner === "a" ? [a, b] : [b, a];
    await Promise.all([decide(chosen, "like"), decide(other, "dislike")]);
    dismissCurrent();
    setPending(false);
  };

  const current = units[0];

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col items-center gap-4">
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div className="relative h-full max-h-[640px] aspect-[3/5] max-w-full">
          {isLoading ? (
            <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
              Lädt…
            </div>
          ) : current ? (
            current.kind === "single" ? (
              <QuickSwipeCard
                key={unitKey(current)}
                candidate={current.candidate}
                onLike={() => handleSingleAction(current.candidate, "like")}
                onDislike={() => handleSingleAction(current.candidate, "dislike")}
                disabled={pending}
              />
            ) : (
              <BattleCard
                key={unitKey(current)}
                a={current.a}
                b={current.b}
                onChoose={(winner) => handleBattleChoice(current.a, current.b, winner)}
                disabled={pending}
              />
            )
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-center px-6">
              <p className="text-sm font-medium">
                {exhausted ? "Tages-Limit erreicht" : "Keine weiteren Vorschläge"}
              </p>
              <p className="text-xs text-muted-foreground">
                {exhausted
                  ? "Morgen geht's weiter -- dann warten wieder neue Karten auf dich."
                  : "Schau später nochmal vorbei."}
              </p>
            </div>
          )}
        </div>
      </div>

      {current?.kind === "single" && (
        <p className="text-xs text-muted-foreground shrink-0">← Nix für mich &nbsp;·&nbsp; Gefällt mir →</p>
      )}
      {current?.kind === "battle" && (
        <p className="text-xs text-muted-foreground shrink-0">Tippe die Seite, die dir mehr zusagt</p>
      )}
    </div>
  );
}
