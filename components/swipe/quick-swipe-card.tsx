"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { motion, useMotionValue, useTransform, animate, type PanInfo } from "framer-motion";
import { MapPin, Sparkles, Star } from "lucide-react";
import type { DiscoveryCandidate } from "@/lib/discovery";

const SWIPE_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 600;
const EXIT_DISTANCE = 700;

/**
 * The one focused card for My Taste's Quick-Swipe -- generic over
 * movie/tv/place (whatever lib/quick-swipe.ts hands it), drag-to-decide
 * like the old movie-only SwipeCard, no friend badges, no watch providers
 * on the card face itself. Tapping (not dragging) the card opens the
 * shared global detail view (components/discovery/candidate-detail-modal.tsx).
 */
export function QuickSwipeCard({
  candidate,
  onLike,
  onDislike,
  onOpenDetail,
  disabled,
  exitDirection,
}: {
  candidate: DiscoveryCandidate;
  onLike: () => void;
  onDislike: () => void;
  /** The whole card is tappable -- opens the shared global detail view. Framer's onTap only fires for an actual tap, never after a real drag, so this can't fight the swipe gesture. */
  onOpenDetail?: () => void;
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

  return (
    <motion.div
      style={{ x, rotate, touchAction: "pan-y" }}
      drag={disabled ? false : "x"}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      onTap={disabled || decidedRef.current ? undefined : onOpenDetail}
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
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Sparkles className="size-8 opacity-40" />
        </div>
      )}

      <motion.div
        style={{ opacity: likeOpacity }}
        className="absolute top-6 left-6 rotate-[-12deg] rounded-md border-4 border-green-500 px-3 py-1 text-lg font-bold text-green-500"
      >
        GEFÄLLT MIR
      </motion.div>
      <motion.div
        style={{ opacity: nopeOpacity }}
        className="absolute top-6 right-6 rotate-[12deg] rounded-md border-4 border-red-500 px-3 py-1 text-lg font-bold text-red-500"
      >
        NIX FÜR MICH
      </motion.div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pt-16 text-white">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium">{candidate.category}</span>
          <span className="text-[11px] text-white/70">{candidate.reason}</span>
        </div>
        <h2 className="text-lg font-semibold leading-tight truncate">{candidate.title}</h2>
        <div className="flex items-center gap-2 text-xs text-white/80">
          {candidate.location && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="size-3 shrink-0" />
              {candidate.location}
            </span>
          )}
          {candidate.rating !== null && candidate.rating > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 font-medium shrink-0">
              <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
              {candidate.rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
