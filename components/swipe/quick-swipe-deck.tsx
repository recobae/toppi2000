"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { likeAndSaveCandidate } from "@/lib/discovery-like";
import { dislikeCandidate } from "@/lib/discovery-dislike";
import { recordSwipeCardAction } from "@/lib/swipe-activity";
import { recordQuickSwipeEvent } from "@/lib/quick-swipe-events";
import { QuickSwipeCard } from "@/components/swipe/quick-swipe-card";
import { BattleCard } from "@/components/swipe/battle-card";
import { CandidateDetailModal } from "@/components/discovery/candidate-detail-modal";
import type { QuickSwipeUnit, MixGroup } from "@/lib/quick-swipe";
import type { DiscoveryCandidate } from "@/lib/discovery";

const REFILL_THRESHOLD = 3;

type QuickSwipeResponse = { units: QuickSwipeUnit[]; exhausted: boolean };

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
 * (Master-Audit round). Unlimited -- no daily card cap anymore, the deck
 * just keeps refilling until the mixer genuinely has nothing left. Tapping
 * a single card (not dragging) opens the shared global detail view; Battle
 * cards don't (tapping a side there already commits that rating, so a
 * third "open details" tap target would conflict with the core gesture).
 */
export function QuickSwipeDeck({ userId }: { userId: string }) {
  const [units, setUnits] = useState<QuickSwipeUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [pending, setPending] = useState(false);
  const [detailCandidate, setDetailCandidate] = useState<DiscoveryCandidate | null>(null);
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
        setExhausted(data.exhausted);
      }
      setIsLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = useCallback(async () => {
    if (isLoadingMore || exhausted) return;
    setIsLoadingMore(true);
    const data = await fetchUnits();
    if (data) {
      const fresh = data.units.filter((unit) => !unitIds(unit).some((id) => seenIdsRef.current.has(id)));
      for (const unit of fresh) for (const id of unitIds(unit)) seenIdsRef.current.add(id);
      setUnits((prev) => [...prev, ...fresh]);
      if (data.exhausted && fresh.length === 0) setExhausted(true);
    }
    setIsLoadingMore(false);
  }, [fetchUnits, isLoadingMore, exhausted]);

  useEffect(() => {
    if (isLoading || isLoadingMore || exhausted) return;
    if (units.length < REFILL_THRESHOLD) loadMore();
  }, [units.length, isLoading, isLoadingMore, exhausted, loadMore]);

  const dismissCurrent = () => {
    setUnits((prev) => prev.slice(1));
  };

  const decide = async (candidate: DiscoveryCandidate, action: "like" | "dislike", unitKind: "single" | "battle") => {
    const supabase = createClient();
    if (action === "like") {
      await likeAndSaveCandidate(supabase, userId, candidate);
    } else {
      await dislikeCandidate(supabase, userId, candidate);
    }
    const [{ error: trackingError }] = await Promise.all([
      recordSwipeCardAction(supabase, userId),
      recordQuickSwipeEvent(supabase, userId, {
        eventType: action,
        unitKind,
        sourceType: candidate.sourceType,
        mixGroup: candidate.mixGroup as MixGroup | undefined,
      }),
    ]);
    if (trackingError) {
      // Activity-log tracking is supplementary -- the actual rating above already succeeded.
      console.error("quick swipe tracking failed", trackingError);
    }
  };

  const handleSingleAction = async (candidate: DiscoveryCandidate, action: "like" | "dislike") => {
    if (pending) return;
    setPending(true);
    await decide(candidate, action, "single");
    dismissCurrent();
    setPending(false);
  };

  const handleBattleChoice = async (a: DiscoveryCandidate, b: DiscoveryCandidate, winner: "a" | "b") => {
    if (pending) return;
    setPending(true);
    const [chosen, other] = winner === "a" ? [a, b] : [b, a];
    const supabase = createClient();
    await Promise.all([
      decide(chosen, "like", "battle"),
      decide(other, "dislike", "battle"),
      recordQuickSwipeEvent(supabase, userId, {
        eventType: "battle_choice",
        unitKind: "battle",
        sourceType: chosen.sourceType,
        mixGroup: chosen.mixGroup as MixGroup | undefined,
      }),
    ]);
    dismissCurrent();
    setPending(false);
  };

  const current = units[0];

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col items-center gap-3">
      <div className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div className="relative h-full w-full max-w-[min(92vw,420px)]">
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
                onOpenDetail={() => {
                  setDetailCandidate(current.candidate);
                  recordQuickSwipeEvent(createClient(), userId, {
                    eventType: "detail_open",
                    unitKind: "single",
                    sourceType: current.candidate.sourceType,
                    mixGroup: current.candidate.mixGroup as MixGroup | undefined,
                  });
                }}
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
              <p className="text-sm font-medium">Keine weiteren Vorschläge</p>
              <p className="text-xs text-muted-foreground">Schau später nochmal vorbei.</p>
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

      {detailCandidate && (
        <CandidateDetailModal candidate={detailCandidate} onClose={() => setDetailCandidate(null)} />
      )}
    </div>
  );
}
