"use client";

import Image from "next/image";
import { useState } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  type PanInfo,
} from "framer-motion";
import { Bookmark, Crown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WatchProviderBadges } from "@/components/watch-provider-badges";
import {
  MovieMetaBadges,
  MovieDetailModal,
  SocialProofLabel,
} from "@/components/movie-info";
import type { SocialProofEntry } from "@/lib/hooks/use-social-proof";
import type { SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";
const SWIPE_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 500;
const EXIT_DELAY_MS = 220;

type SwipeDirection = "left" | "right" | "up";

export function SwipeCard({
  result,
  stackIndex,
  isTop,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onAddToWatchlist,
  socialProof,
}: {
  result: SearchResult;
  stackIndex: number;
  isTop: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeUp: () => void;
  onAddToWatchlist: () => void;
  socialProof?: SocialProofEntry;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-250, 250], [-18, 18]);
  const likeOpacity = useTransform(x, [20, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-120, -20], [1, 0]);
  const upOpacity = useTransform(y, [-120, -20], [1, 0]);
  const [isExiting, setIsExiting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const exit = (direction: SwipeDirection, callback: () => void) => {
    setIsExiting(true);
    if (direction === "left") {
      animate(x, -600, { duration: 0.25, ease: "easeIn" });
    } else if (direction === "right") {
      animate(x, 600, { duration: 0.25, ease: "easeIn" });
    } else {
      animate(y, -700, { duration: 0.25, ease: "easeIn" });
    }
    setTimeout(callback, EXIT_DELAY_MS);
  };

  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    const { offset, velocity } = info;
    const isVertical = Math.abs(offset.y) > Math.abs(offset.x);

    if (
      isVertical &&
      (offset.y < -SWIPE_THRESHOLD || velocity.y < -VELOCITY_THRESHOLD)
    ) {
      exit("up", onSwipeUp);
    } else if (offset.x > SWIPE_THRESHOLD || velocity.x > VELOCITY_THRESHOLD) {
      exit("right", onSwipeRight);
    } else if (
      offset.x < -SWIPE_THRESHOLD ||
      velocity.x < -VELOCITY_THRESHOLD
    ) {
      exit("left", onSwipeLeft);
    } else {
      animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
      animate(y, 0, { type: "spring", stiffness: 300, damping: 30 });
    }
  };

  return (
    <motion.div
      className="absolute inset-0"
      animate={{
        scale: 1 - stackIndex * 0.04,
        y: stackIndex * 10,
        opacity: isExiting ? 1 : 1,
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      style={{ zIndex: 10 - stackIndex }}
    >
      <motion.div
        className="h-full w-full touch-none"
        style={isTop ? { x, y, rotate } : undefined}
        drag={isTop}
        dragElastic={0.9}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        onDragEnd={isTop ? handleDragEnd : undefined}
      >
        <div className="relative h-full w-full rounded-2xl overflow-hidden border bg-card shadow-lg select-none flex flex-col">
          <div className="relative h-2/3 w-full bg-muted shrink-0">
            {result.posterPath ? (
              <Image
                src={`${POSTER_BASE_URL}${result.posterPath}`}
                alt={result.title}
                fill
                sizes="400px"
                className="object-cover pointer-events-none"
                priority={isTop}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Kein Poster
              </div>
            )}

            <button
              type="button"
              aria-label="Details anzeigen"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                setShowDetails(true);
              }}
              className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            >
              <Info className="size-5" />
            </button>

            {isTop && (
              <>
                <motion.div
                  style={{ opacity: likeOpacity }}
                  className="absolute top-4 left-4 rounded-lg border-4 border-green-500 px-3 py-1 text-green-500 font-bold text-xl -rotate-12"
                >
                  GEFÄLLT MIR
                </motion.div>
                <motion.div
                  style={{ opacity: nopeOpacity }}
                  className="absolute top-4 right-4 rounded-lg border-4 border-red-500 px-3 py-1 text-red-500 font-bold text-xl rotate-12"
                >
                  NOPE
                </motion.div>
                <motion.div
                  style={{ opacity: upOpacity }}
                  className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl border-4 border-yellow-400 bg-yellow-400/10 px-4 py-2 text-yellow-400 font-extrabold text-2xl sm:text-3xl drop-shadow-lg"
                >
                  <Crown className="size-7 sm:size-8 fill-current" />
                  Lieblingsfilm!
                </motion.div>
              </>
            )}
          </div>

          <div className="p-3 flex flex-col gap-2 flex-1 min-h-0">
            <div>
              <p className="text-sm font-semibold leading-tight line-clamp-1">
                {result.title}
              </p>
              <MovieMetaBadges details={result.movieDetails} year={result.year} />
              <SocialProofLabel entry={socialProof} />
            </div>
            <WatchProviderBadges
              providers={result.watchProviders}
              title={result.title}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-auto"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onAddToWatchlist();
              }}
            >
              <Bookmark className="size-4" />
              Zur Watchlist
            </Button>
          </div>
        </div>
      </motion.div>

      {showDetails && (
        <MovieDetailModal
          title={result.title}
          posterUrl={
            result.posterPath ? `${POSTER_BASE_URL}${result.posterPath}` : null
          }
          year={result.year}
          details={result.movieDetails}
          tmdbId={result.id}
          mediaType={result.mediaType}
          onClose={() => setShowDetails(false)}
        />
      )}
    </motion.div>
  );
}
