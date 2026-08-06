"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Ban, Heart, MapPin, MessageCircle, Sparkles, Star, Users } from "lucide-react";
import type { DiscoveryCandidate } from "@/lib/discovery";

/**
 * Renders inside a parent `<AnimatePresence mode="popLayout">` (see
 * DiscoveryStream / DiscoverySection) -- AnimatePresence needs to own the
 * list of children to animate an exit, so it belongs around the `.map()`
 * call, not inside each individual row.
 */

/**
 * One row of the "Für Dich" list stream -- Titel, Kategorie+Quelle,
 * Begründung, Notiz, Gefällt mir/Nix für mich, in exactly that order.
 * Only two rating buttons exist anywhere in the app now -- "Skip" as its
 * own third state was removed (Master-Audit round); "Nix für mich" carries
 * the same 30-day resurfacing behavior Skip used to.
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
  const sourceLine =
    candidate.sourceUsernames.length === 0
      ? null
      : candidate.sourceUsernames.length === 1
        ? candidate.sourceUsernames[0]
        : `${candidate.sourceUsernames[0]} +${candidate.sourceUsernames.length - 1}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -60, transition: { duration: 0.2 } }}
      className="flex gap-3 rounded-xl border p-3 shadow-sm hover:shadow-md transition-shadow"
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

          {/* 2. Kategorie + Quelle */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium">{candidate.category}</span>
            {candidate.location && (
              <span className="inline-flex items-center gap-0.5 truncate max-w-[10rem]">
                <MapPin className="size-3 shrink-0" />
                {candidate.location}
              </span>
            )}
            {sourceLine && <span className="truncate">Von {sourceLine}</span>}
            {candidate.rating !== null && candidate.rating > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Star className="size-3 fill-yellow-400 text-yellow-400" />
                {candidate.rating.toFixed(1)}
              </span>
            )}
          </div>

          {/* 3. Begründung / Relevanz */}
          <p className="inline-flex items-center gap-1 w-fit text-[11px] font-medium text-primary">
            {candidate.socialSupportCount >= 2 && <Users className="size-3 shrink-0" />}
            {candidate.reason}
          </p>

          {/* 4. Notiz */}
          {candidate.note && (
            <p className="flex items-start gap-1 text-xs text-muted-foreground italic">
              <MessageCircle className="size-3 mt-0.5 shrink-0" />
              <span className="line-clamp-2">„{candidate.note}“</span>
            </p>
          )}

          {/* 5. Gefällt mir / Nix für mich -- gleiche Icons/Farben wie ActionBar (components/items/list-item-row.tsx) im Rest der App. */}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={onLike}
              disabled={pending}
              aria-label="Gefällt mir -- auf meine Liste"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-green-600 hover:bg-green-600/10 transition-colors disabled:opacity-50"
            >
              <Heart className="size-4" />
            </button>
            <button
              type="button"
              onClick={onDislike}
              disabled={pending}
              aria-label="Nix für mich"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              <Ban className="size-4" />
            </button>
          </div>
        </div>
      </motion.div>
  );
}
