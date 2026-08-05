"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { motion, useMotionValue, useTransform, animate, type PanInfo } from "framer-motion";
import { MapPin, MessageCircle, Sparkles, Star, Users } from "lucide-react";
import type { DiscoveryCandidate } from "@/lib/discovery";

const SWIPE_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 600;
const EXIT_DISTANCE = 700;

/**
 * One card of the "Für Dich" stream -- source-agnostic (movie/tv/place/
 * topf), always the same 5-part layout the product spec calls for: Titel,
 * Kategorie+Quelle, Begründung, Notiz, Like/Dislike/Skip. Drag mirrors
 * SwipeCard's gesture physics for Like/Dislike; Skip is a separate explicit
 * button since a drag gesture can't cleanly express "neither yes nor no".
 */
export function DiscoveryCard({
  candidate,
  onLike,
  onDislike,
  disabled,
  exitDirection,
}: {
  candidate: DiscoveryCandidate;
  onLike: () => void;
  onDislike: () => void;
  disabled?: boolean;
  exitDirection?: "left" | "right" | null;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-20, 20]);
  const likeOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1]);
  const nopeOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0]);
  const decidedRef = useRef(false);

  useEffect(() => {
    if (!exitDirection) return;
    const target = exitDirection === "right" ? EXIT_DISTANCE : -EXIT_DISTANCE;
    const controls = animate(x, target, { type: "tween", duration: 0.35, ease: "easeIn" });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitDirection]);

  const handleDragEnd = (_event: unknown, info: PanInfo) => {
    if (disabled || decidedRef.current) return;
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const pastThreshold = Math.abs(offset) > SWIPE_THRESHOLD;
    const flicked = Math.abs(velocity) > VELOCITY_THRESHOLD;

    if (pastThreshold || flicked) {
      decidedRef.current = true;
      const direction = offset !== 0 ? Math.sign(offset) : Math.sign(velocity) || 1;
      animate(x, direction * EXIT_DISTANCE, {
        type: "spring",
        velocity,
        stiffness: 200,
        damping: 24,
        onComplete: () => (direction > 0 ? onLike() : onDislike()),
      });
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  };

  const sourceLine =
    candidate.sourceUsernames.length === 0
      ? null
      : candidate.sourceUsernames.length === 1
        ? `Von ${candidate.sourceUsernames[0]}`
        : `Von ${candidate.sourceUsernames[0]} +${candidate.sourceUsernames.length - 1} weiteren`;

  return (
    <motion.div
      style={{ x, rotate, touchAction: "pan-y" }}
      drag={disabled ? false : "x"}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      className="relative h-full w-full rounded-2xl overflow-hidden bg-muted shadow-xl select-none cursor-grab active:cursor-grabbing"
    >
      {candidate.imageUrl ? (
        <Image
          src={candidate.imageUrl}
          alt={candidate.title}
          fill
          sizes="384px"
          className="object-cover pointer-events-none"
          priority
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          <Sparkles className="size-8 opacity-40" />
        </div>
      )}

      {candidate.socialSupportCount >= 2 && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-full bg-black/60 pl-1.5 pr-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          <Users className="size-3 shrink-0" />
          {candidate.socialSupportCount} aus deinem Netzwerk
        </div>
      )}

      <motion.div
        style={{ opacity: likeOpacity }}
        className="absolute top-6 left-6 rotate-[-12deg] rounded-md border-4 border-green-500 px-3 py-1 text-lg font-bold text-green-500"
      >
        LIKE
      </motion.div>
      <motion.div
        style={{ opacity: nopeOpacity }}
        className="absolute top-6 right-6 rotate-[12deg] rounded-md border-4 border-red-500 px-3 py-1 text-lg font-bold text-red-500"
      >
        NOPE
      </motion.div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 pt-16 text-white">
        {/* 1. Titel */}
        <h2 className="text-lg font-semibold leading-tight truncate">{candidate.title}</h2>

        {/* 2. Kategorie + Quelle */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/80">
          <span className="rounded-full bg-white/15 px-2 py-0.5 font-medium">{candidate.category}</span>
          {candidate.location && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="size-3 shrink-0" />
              {candidate.location}
            </span>
          )}
          {sourceLine && <span className="truncate">{sourceLine}</span>}
          {candidate.rating !== null && candidate.rating > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 font-medium shrink-0">
              <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
              {candidate.rating.toFixed(1)}
            </span>
          )}
        </div>

        {/* 3. Begründung / Relevanz */}
        <p className="text-xs font-medium text-primary-foreground/90 bg-primary/40 rounded-md px-2 py-1 w-fit">
          {candidate.reason}
        </p>

        {/* 4. Notiz -- zentral, immer sichtbar wenn vorhanden */}
        {candidate.note && (
          <p className="flex items-start gap-1.5 text-sm leading-snug text-white/90 italic">
            <MessageCircle className="size-3.5 mt-0.5 shrink-0" />
            <span className="line-clamp-3">„{candidate.note}“</span>
          </p>
        )}
      </div>
    </motion.div>
  );
}

/**
 * 5. Like / Dislike / Skip -- rendered by the parent stream below the card
 * stack (not inside DiscoveryCard itself, which has overflow-hidden for the
 * image/gradient and can't host anything visible outside its own bounds).
 */
export function DiscoveryCardActions({
  onLike,
  onDislike,
  onSkip,
  disabled,
}: {
  onLike: () => void;
  onDislike: () => void;
  onSkip: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={onDislike}
        aria-label="Nicht mein Fall"
        disabled={disabled}
        className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-red-500 text-red-500 bg-background shadow-md hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        ✕
      </button>
      <button
        type="button"
        onClick={onSkip}
        aria-label="Überspringen"
        disabled={disabled}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-input text-muted-foreground bg-background shadow-sm hover:bg-accent transition-colors disabled:opacity-50"
      >
        →
      </button>
      <button
        type="button"
        onClick={onLike}
        aria-label="Gefällt mir"
        disabled={disabled}
        className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-green-500 text-green-500 bg-background shadow-md hover:bg-green-50 transition-colors disabled:opacity-50"
      >
        ♥
      </button>
    </div>
  );
}
