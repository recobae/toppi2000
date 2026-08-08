"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Clapperboard, MapPin, MessageCircle, Sparkles, Star, Tag } from "lucide-react";
import { CandidateDetailModal } from "@/components/discovery/candidate-detail-modal";
import { RatingIconButton } from "@/components/ui/rating-icon-button";
import type { DiscoveryCandidate } from "@/lib/discovery";
import type { RatingDecision } from "@/lib/rating-engine";

/**
 * Renders inside a parent `<AnimatePresence mode="popLayout">` (see
 * DiscoverySection / PersonalDiscoverySection) -- AnimatePresence needs to
 * own the list of children to animate an exit, so it belongs around the
 * `.map()` call, not inside each individual row.
 */

/**
 * One row of a "Für Dich" candidate list -- Titel, dann Stadt/Region ODER
 * Medienkontext (Film/Serie · Genre), dann bei Orten zusätzlich die
 * Kategorie als eigene Zeile, dann die soziale Quelle, dann Gefällt-mir/
 * Nix-für-mich. Reihenfolge und Klarheit sind bewusst so gewählt, dass die
 * Karte auf Mobile in einem Blick scannbar ist (Struktur-Runde, Punkt 6).
 * Die gesamte Karte ist tappbar und öffnet die globale Detailansicht
 * (CandidateDetailModal, wiederverwendet, keine zweite Detail-Logik) --
 * die drei Bewertungsbuttons stoppen die Klick-Propagation, damit ein
 * Bewerten nie gleichzeitig die Detailansicht öffnet. Drei gleichwertige
 * Bewertungen (Lohnt-sich-Umbau): ✅ Lohnt sich, ❌ Lohnt sich nicht, ❓ Kenne
 * ich noch nicht -- "Kenne ich noch nicht" verändert keine Statistik.
 */
export function DiscoveryListRow({
  candidate,
  onRate,
  pending,
}: {
  candidate: DiscoveryCandidate;
  onRate: (decision: RatingDecision) => void;
  pending?: boolean;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const isPlace = candidate.sourceType === "place";
  const regionLabel = isPlace ? (candidate.ref.regionName ?? candidate.location) : null;
  const genre = candidate.ref.movieDetails?.genres?.[0];

  const openDetail = () => {
    if (pending) return;
    setShowDetail(true);
  };

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -60, transition: { duration: 0.2 } }}
        onClick={openDetail}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") openDetail();
        }}
        aria-label={`${candidate.title} -- Details öffnen`}
        className="flex gap-3 rounded-xl border p-3 shadow-card hover:shadow-raised transition-shadow cursor-pointer"
      >
        <div className="relative size-16 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center text-muted-foreground">
          {candidate.imageUrl ? (
            <Image src={candidate.imageUrl} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <Sparkles className="size-5 opacity-40" />
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {/* 1. Titel */}
          <p className="text-sm font-semibold leading-tight truncate">{candidate.title}</p>

          {isPlace ? (
            <>
              {/* 2. Stadt/Region */}
              {regionLabel && (
                <span className="inline-flex items-center gap-1 w-fit text-xs font-medium text-foreground">
                  <MapPin className="size-3.5 shrink-0 text-primary" />
                  {regionLabel}
                </span>
              )}
              {/* 3. Kategorie */}
              <span className="inline-flex items-center gap-1 w-fit text-xs text-muted-foreground">
                <Tag className="size-3.5 shrink-0" />
                {candidate.category}
              </span>
            </>
          ) : (
            // Bei Filmen/Serien ist "Kategorie" (Film/Serie) und Medienkontext
            // (Genre) eine gemeinsame Zeile, kein eigener Stadt-Slot.
            <span className="inline-flex items-center gap-1 w-fit text-xs font-medium text-foreground">
              <Clapperboard className="size-3.5 shrink-0 text-primary" />
              {candidate.category}
              {genre && ` · ${genre}`}
            </span>
          )}

          {/* 4. Relevanz-Grund -- aus echten Signalen gebaut (lib/discovery.ts#buildReason), prominenter als früher (Lohnt-sich-Umbau §3). */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium text-foreground">
            <span>{candidate.reason}</span>
            {candidate.rating !== null && candidate.rating > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Star className="size-3 fill-yellow-400 text-yellow-400" />
                {candidate.rating.toFixed(1)}
              </span>
            )}
          </div>

          {candidate.note && (
            <p className="flex items-start gap-1 text-xs text-muted-foreground italic">
              <MessageCircle className="size-3 mt-0.5 shrink-0" />
              <span className="line-clamp-2">„{candidate.note}“</span>
            </p>
          )}

          {/* 5. Aktionen -- exakt dieselbe Komponente wie überall sonst im Projekt (components/ui/rating-icon-button.tsx). */}
          <div className="flex items-center gap-1.5 pt-1">
            <RatingIconButton
              decision="lohnt_sich"
              disabled={pending}
              onClick={(event) => {
                event.stopPropagation();
                onRate("lohnt_sich");
              }}
            />
            <RatingIconButton
              decision="lohnt_sich_nicht"
              disabled={pending}
              onClick={(event) => {
                event.stopPropagation();
                onRate("lohnt_sich_nicht");
              }}
            />
            <RatingIconButton
              decision="kenne_ich_nicht"
              disabled={pending}
              onClick={(event) => {
                event.stopPropagation();
                onRate("kenne_ich_nicht");
              }}
            />
          </div>
        </div>
      </motion.div>

      {showDetail && <CandidateDetailModal candidate={candidate} onClose={() => setShowDetail(false)} />}
    </>
  );
}
