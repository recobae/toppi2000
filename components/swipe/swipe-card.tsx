"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { Info, Star } from "lucide-react";
import type { SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";
const PROVIDER_LOGO_BASE_URL = "https://image.tmdb.org/t/p/w45";
const SWIPE_THRESHOLD = 100;

/**
 * The card face itself -- drag-to-swipe (mouse or touch, via pointer
 * events) for Like/Dislike, plus an info button opening the existing full
 * detail view. Watchlist/Skip are deliberately NOT on this card -- they're
 * separate buttons rendered by the deck around it.
 */
export function SwipeCard({
  item,
  onLike,
  onDislike,
  onOpenDetails,
  disabled,
}: {
  item: SearchResult;
  onLike: () => void;
  onDislike: () => void;
  onOpenDetails: () => void;
  disabled?: boolean;
}) {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);

  const posterUrl = item.posterPath ? `${POSTER_BASE_URL}${item.posterPath}` : null;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startXRef.current = event.clientX;
    setIsDragging(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setDragX(event.clientX - startXRef.current);
  };

  const endDrag = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragX > SWIPE_THRESHOLD) {
      onLike();
    } else if (dragX < -SWIPE_THRESHOLD) {
      onDislike();
    }
    setDragX(0);
  };

  const rotation = dragX / 20;
  const hintOpacity = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1);
  const rating = item.movieDetails.voteAverage;
  const genres = item.movieDetails.genres.slice(0, 3);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
        transition: isDragging ? "none" : "transform 0.3s ease",
        touchAction: "pan-y",
      }}
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

      {dragX > 20 && (
        <div
          style={{ opacity: hintOpacity }}
          className="absolute top-6 left-6 rotate-[-12deg] rounded-md border-4 border-green-500 px-3 py-1 text-lg font-bold text-green-500"
        >
          LIKE
        </div>
      )}
      {dragX < -20 && (
        <div
          style={{ opacity: hintOpacity }}
          className="absolute top-6 right-6 rotate-[12deg] rounded-md border-4 border-red-500 px-3 py-1 text-lg font-bold text-red-500"
        >
          NOPE
        </div>
      )}

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
    </div>
  );
}
