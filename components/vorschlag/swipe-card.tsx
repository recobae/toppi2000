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
import { Heart, X } from "lucide-react";
import { WatchProviderBadges } from "@/components/watch-provider-badges";
import {
  MovieMetaBadges,
  MovieDetailModal,
  SocialProofIcons,
} from "@/components/movie-info";
import {
  CATEGORY_ACTION_LABELS,
  CATEGORY_ICONS,
  VISIBLE_SAVED_CATEGORIES,
  type SavedCategory,
} from "@/lib/categories";
import type { SocialProofBreakdown } from "@/lib/hooks/use-social-proof";
import type { SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";
const SWIPE_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 500;
const EXIT_DELAY_MS = 220;

type ExitDirection = "left" | "right" | "up";

const CATEGORY_EXIT_DIRECTION: Record<SavedCategory, ExitDirection> = {
  dont_watch: "left",
  top_list: "up",
  watchlist: "right",
};

const CATEGORY_BUTTON_CLASSES: Record<SavedCategory, string> = {
  dont_watch:
    "border-red-500 text-red-500 hover:bg-red-500/10",
  top_list:
    "border-primary bg-primary text-primary-foreground scale-110 shadow-lg",
  watchlist: "border-input text-foreground hover:bg-accent",
};

export function SwipeCard({
  result,
  stackIndex,
  isTop,
  isLoggedIn,
  onSwipeLeft,
  onSwipeRight,
  onCategorySelect,
  onGuestClick,
  socialProof,
}: {
  result: SearchResult;
  stackIndex: number;
  isTop: boolean;
  isLoggedIn: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onCategorySelect: (category: SavedCategory) => void;
  onGuestClick: () => void;
  socialProof?: SocialProofBreakdown;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-250, 250], [-18, 18]);
  const likeOpacity = useTransform(x, [20, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-120, -20], [1, 0]);
  const [isExiting, setIsExiting] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const exit = (direction: ExitDirection, callback: () => void) => {
    if (isExiting) return;
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

    if (offset.x > SWIPE_THRESHOLD || velocity.x > VELOCITY_THRESHOLD) {
      if (!isLoggedIn) {
        animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
        onGuestClick();
        return;
      }
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

  const handleCategoryClick = (category: SavedCategory) => {
    if (!isLoggedIn) {
      onGuestClick();
      return;
    }
    exit(CATEGORY_EXIT_DIRECTION[category], () => onCategorySelect(category));
  };

  const handleNopeClick = () => {
    exit("left", onSwipeLeft);
  };

  const handleLikeClick = () => {
    if (!isLoggedIn) {
      onGuestClick();
      return;
    }
    exit("right", onSwipeRight);
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
        drag={isTop ? "x" : false}
        dragElastic={0.9}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        onDragEnd={isTop ? handleDragEnd : undefined}
      >
        <div className="relative h-full w-full rounded-2xl overflow-hidden border bg-card shadow-lg select-none flex flex-col">
          <button
            type="button"
            aria-label="Details anzeigen"
            onClick={() => setShowDetails(true)}
            className="relative h-2/3 w-full bg-muted shrink-0 text-left"
          >
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
              </>
            )}
          </button>

          <div className="p-3 flex flex-col gap-2 flex-1 min-h-0">
            <div>
              <p className="text-sm font-semibold leading-tight line-clamp-1">
                {result.title}
              </p>
              <MovieMetaBadges details={result.movieDetails} year={result.year} />
              <SocialProofIcons
                breakdown={socialProof}
                onClick={() => setShowDetails(true)}
                className="mt-1"
              />
            </div>
            <WatchProviderBadges
              providers={result.watchProviders}
              title={result.title}
            />
            <div className="mt-auto flex items-center justify-between gap-2">
              {VISIBLE_SAVED_CATEGORIES.map(
                (category) => {
                  const Icon = CATEGORY_ICONS[category];
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-label={CATEGORY_ACTION_LABELS[category]}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleCategoryClick(category);
                      }}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-full border h-10 text-xs font-medium transition-colors ${CATEGORY_BUTTON_CLASSES[category]}`}
                    >
                      <Icon className="size-4" />
                    </button>
                  );
                },
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {isTop && (
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-8 z-30 flex items-center gap-7">
          <button
            type="button"
            aria-label="Kein Interesse"
            onClick={handleNopeClick}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-background border-[3px] border-red-500 text-red-500 shadow-xl hover:scale-105 active:scale-95 transition-transform"
          >
            <X className="size-8" strokeWidth={3} />
          </button>
          <button
            type="button"
            aria-label="Gefällt mir"
            onClick={handleLikeClick}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-background border-[3px] border-green-500 text-green-500 shadow-xl hover:scale-105 active:scale-95 transition-transform"
          >
            <Heart className="size-8 fill-current" />
          </button>
        </div>
      )}

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
          socialProof={socialProof}
          onClose={() => setShowDetails(false)}
        />
      )}
    </motion.div>
  );
}
