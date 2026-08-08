"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { rateCandidate, type RatingDecision } from "@/lib/rating-engine";
import { recordSwipeCardAction } from "@/lib/swipe-activity";
import { recordQuickSwipeEvent } from "@/lib/quick-swipe-events";
import { QuickSwipeCard } from "@/components/swipe/quick-swipe-card";
import { RatingIconButton } from "@/components/ui/rating-icon-button";
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
 * "Lohnt sich?"'s entire content: one focused unit (single card or Battle)
 * at a time, ✅ Lohnt sich / ❌ Lohnt sich nicht / ❓ Kenne ich noch nicht (or
 * a Battle tap), immediately the next unit. No filters, no categories, no
 * notes, no list management, no social feed elements -- those all belong in
 * Für Dich or the Profil, never here. Unlimited -- no daily card cap, the
 * deck just keeps refilling until the mixer genuinely has nothing left.
 * Tapping a single card (not dragging) opens the shared global detail view;
 * Battle cards don't (tapping a side there already commits that rating, so
 * a third "open details" tap target would conflict with the core gesture).
 *
 * Rating/Credit/Tracking writes never block the next card: `decide()` fires
 * them in the background (no `await` at the call site) so the UI advances
 * the instant the user taps or swipes, matching the Lohnt-sich-Umbau's
 * "kein sichtbares Warten auf Hintergrundspeicherungen" requirement.
 */
export function QuickSwipeDeck({ userId }: { userId: string }) {
  const [units, setUnits] = useState<QuickSwipeUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
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

  const decisionToEventType: Record<RatingDecision, "like" | "dislike" | "neutral"> = {
    lohnt_sich: "like",
    lohnt_sich_nicht: "dislike",
    kenne_ich_nicht: "neutral",
  };

  /**
   * Fire-and-forget: the rating write, the credit fan-out, and the tracking
   * writes all happen in the background. Callers never `await` this --
   * dismissCurrent() already ran by the time this settles, so the next card
   * is on screen well before any of these Supabase round-trips complete.
   */
  const decide = (candidate: DiscoveryCandidate, decision: RatingDecision, unitKind: "single" | "battle") => {
    const supabase = createClient();
    rateCandidate(supabase, userId, candidate, decision).catch((err) =>
      console.error("quick swipe rating failed", err),
    );
    Promise.all([
      recordSwipeCardAction(supabase, userId),
      recordQuickSwipeEvent(supabase, userId, {
        eventType: decisionToEventType[decision],
        unitKind,
        sourceType: candidate.sourceType,
        mixGroup: candidate.mixGroup as MixGroup | undefined,
      }),
    ]).catch((err) => console.error("quick swipe tracking failed", err));
  };

  // Guards against the same card being decided twice (e.g. a drag-release
  // and a button tap landing in the same frame) -- a ref, not state, so it
  // never delays the next card being shown.
  const decidingIdRef = useRef<string | null>(null);

  const handleSingleAction = (candidate: DiscoveryCandidate, decision: RatingDecision) => {
    if (decidingIdRef.current === candidate.id) return;
    decidingIdRef.current = candidate.id;
    decide(candidate, decision, "single");
    dismissCurrent();
  };

  const handleBattleChoice = (a: DiscoveryCandidate, b: DiscoveryCandidate, winner: "a" | "b") => {
    const key = `${a.id}|${b.id}`;
    if (decidingIdRef.current === key) return;
    decidingIdRef.current = key;
    const [chosen, other] = winner === "a" ? [a, b] : [b, a];
    const supabase = createClient();
    decide(chosen, "lohnt_sich", "battle");
    decide(other, "lohnt_sich_nicht", "battle");
    recordQuickSwipeEvent(supabase, userId, {
      eventType: "battle_choice",
      unitKind: "battle",
      sourceType: chosen.sourceType,
      mixGroup: chosen.mixGroup as MixGroup | undefined,
    }).catch((err) => console.error("quick swipe tracking failed", err));
    dismissCurrent();
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
                onLike={() => handleSingleAction(current.candidate, "lohnt_sich")}
                onDislike={() => handleSingleAction(current.candidate, "lohnt_sich_nicht")}
                onOpenDetail={() => {
                  setDetailCandidate(current.candidate);
                  recordQuickSwipeEvent(createClient(), userId, {
                    eventType: "detail_open",
                    unitKind: "single",
                    sourceType: current.candidate.sourceType,
                    mixGroup: current.candidate.mixGroup as MixGroup | undefined,
                  });
                }}
              />
            ) : (
              <BattleCard
                key={unitKey(current)}
                a={current.a}
                b={current.b}
                onChoose={(winner) => handleBattleChoice(current.a, current.b, winner)}
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

      {/* Drei gleichwertige, dauerhaft sichtbare Bewertungsaktionen (§2) --
          ✅/❌ sind zusätzlich per Swipe auslösbar (siehe QuickSwipeCard),
          ❓ nur per Button, da eine dritte Swipe-Richtung auf Mobile
          fehleranfällig wäre. */}
      {current?.kind === "single" && (
        <div className="flex items-center gap-4 shrink-0">
          <RatingIconButton
            decision="lohnt_sich_nicht"
            size="lg"
            onClick={() => handleSingleAction(current.candidate, "lohnt_sich_nicht")}
          />
          <RatingIconButton
            decision="kenne_ich_nicht"
            size="lg"
            onClick={() => handleSingleAction(current.candidate, "kenne_ich_nicht")}
          />
          <RatingIconButton
            decision="lohnt_sich"
            size="lg"
            onClick={() => handleSingleAction(current.candidate, "lohnt_sich")}
          />
        </div>
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
