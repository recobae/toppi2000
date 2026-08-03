"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  type PanInfo,
} from "framer-motion";
import { Info, Star } from "lucide-react";
import type { SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";
const PROVIDER_LOGO_BASE_URL = "https://image.tmdb.org/t/p/w45";
const SWIPE_THRESHOLD = 100;
// A fast flick counts as a decision even if released before crossing the
// distance threshold -- px/s, matches Framer's PanInfo.velocity unit.
const VELOCITY_THRESHOLD = 600;
const EXIT_DISTANCE = 700;

/**
 * The card face itself -- drag-to-swipe (mouse or touch) for Like/Dislike,
 * plus an info button opening the full detail view. Watchlist/Skip live
 * only in that detail view, not here -- the card itself is gesture-only.
 *
 * Drag position lives in a Framer Motion value (x), not React state, so a
 * finger dragging the card doesn't trigger a re-render per pixel -- only
 * the transform updates, which is what keeps this at 60fps. Release
 * decides between a spring back to center or a velocity-carried fling off
 * screen; exitDirection lets a parent (e.g. a decision made in the detail
 * view instead of by dragging) trigger the same fling programmatically.
 */
export function SwipeCard({
  item,
  onLike,
  onDislike,
  onOpenDetails,
  disabled,
  exitDirection,
}: {
  item: SearchResult;
  onLike: () => void;
  onDislike: () => void;
  onOpenDetails: () => void;
  disabled?: boolean;
  exitDirection?: "left" | "right" | null;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-20, 20]);
  const likeOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1]);
  const nopeOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0]);

  const posterUrl = item.posterPath ? `${POSTER_BASE_URL}${item.posterPath}` : null;
  // Guards against a second drag starting mid-fling, before the parent's
  // `disabled` prop has had a chance to catch up (onComplete -> onLike ->
  // async save -> re-render is not instant).
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

  const rating = item.movieDetails.voteAverage;
  const genres = item.movieDetails.genres.slice(0, 3);

  return (
    <motion.div
      style={{ x, rotate, touchAction: "pan-y" }}
      drag={disabled ? false : "x"}
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      className="relative h-full w-full rounded-2xl overflow-hidden bg-muted shadow-xl select-none cursor-grab active:cursor-grabbing"
    >
      {posterUrl ? (
        <Image
          src={posterUrl}
          alt={item.title}
          fill
          sizes="384px"
          className="object-cover pointer-events-none"
          priority
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          Kein Poster
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

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 pt-12 text-white">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="text-lg font-semibold leading-tight truncate">
              {item.title}
              {item.year ? ` (${item.year})` : ""}
            </h2>
            {genres.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {genres.map((genre) => (
                  <span
                    key={genre}
                    className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetails();
            }}
            aria-label="Details anzeigen"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors"
          >
            <Info className="size-4" />
          </button>
        </div>

        {item.overview && (
          <p className="text-xs leading-snug text-white/80 line-clamp-3">{item.overview}</p>
        )}

        <div className="flex items-center gap-2 pt-1">
          {item.watchProviders.flatrate.length > 0 && (
            <div className="flex -space-x-1.5">
              {item.watchProviders.flatrate.slice(0, 4).map((provider) => (
                <span
                  key={provider.providerId}
                  className="relative size-6 rounded-full ring-2 ring-black/50 overflow-hidden bg-white"
                >
                  <Image
                    src={`${PROVIDER_LOGO_BASE_URL}${provider.logoPath}`}
                    alt={provider.name}
                    fill
                    sizes="24px"
                    className="object-cover"
                  />
                </span>
              ))}
            </div>
          )}
          {rating !== null && rating > 0 && (
            <div className="ml-auto flex items-center gap-1 text-xs font-medium">
              <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
              {rating.toFixed(1)}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
