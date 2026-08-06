"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Ban, Clapperboard, Heart, MapPin, MessageCircle, Sparkles, Star, Tag, Users } from "lucide-react";
import { CandidateDetailModal } from "@/components/discovery/candidate-detail-modal";
import type { DiscoveryCandidate } from "@/lib/discovery";

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
 * Like/Nix-für-mich stoppen die Klick-Propagation, damit ein Bewerten nie
 * gleichzeitig die Detailansicht öffnet. Only two rating buttons exist
 * anywhere in the app now -- "Skip" as its own third state was removed
 * (Master-Audit round); "Nix für mich" carries the same 30-day resurfacing
 * behavior Skip used to.
 */
export function DiscoveryListRow({
  candidate,
  onLike,
  onDislike,
  pending,
}: {
  candidate: DiscoveryCandidate;
  onLike: () => void;
  onDislike: () => void;
  pending?: boolean;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const isPlace = candidate.sourceType === "place";
  const regionLabel = isPlace ? (candidate.ref.regionName ?? candidate.location) : null;
  const genre = candidate.ref.movieDetails?.genres?.[0];

  const sourceLine =
    candidate.sourceUsernames.length === 0
      ? null
      : candidate.sourceUsernames.length === 1
        ? `Von ${candidate.sourceUsernames[0]} bewertet`
        : `Von ${candidate.sourceUsernames[0]} +${candidate.sourceUsernames.length - 1} bewertet`;

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
        className="flex gap-3 rounded-xl border p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
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

          {/* 4. Soziale Quelle */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
            {sourceLine && (
              <span className="inline-flex items-center gap-1">
                {candidate.socialSupportCount >= 2 && <Users className="size-3 shrink-0" />}
                {sourceLine}
              </span>
            )}
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

          {/* 5. Aktionen -- gleiche Icons/Farben wie ActionBar (components/items/list-item-row.tsx) im Rest der App. */}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onLike();
              }}
              disabled={pending}
              aria-label="Gefällt mir -- auf meine Liste"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-green-600 hover:bg-green-600/10 transition-colors disabled:opacity-50"
            >
              <Heart className="size-4" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDislike();
              }}
              disabled={pending}
              aria-label="Nix für mich"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              <Ban className="size-4" />
            </button>
          </div>
        </div>
      </motion.div>

      {showDetail && <CandidateDetailModal candidate={candidate} onClose={() => setShowDetail(false)} />}
    </>
  );
}
