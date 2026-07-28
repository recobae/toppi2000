"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { WatchProviderBadges } from "@/components/watch-provider-badges";
import {
  MovieMetaBadges,
  MovieDetailModal,
  SocialProofIcons,
} from "@/components/movie-info";
import { SaveButtons } from "@/components/search/save-buttons";
import { truncateNote } from "@/lib/notes";
import type { SavedState } from "@/lib/hooks/use-saved-state";
import type { SocialProofBreakdown } from "@/lib/hooks/use-social-proof";
import type { SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

const EMPTY_SAVED_STATE: SavedState = {
  top_list: false,
  watchlist: false,
  dont_watch: false,
  likes: false,
};

export function SearchResultCard({
  result,
  isLoggedIn,
  userId,
  savedState,
  onSavedChange,
  jobTags,
  onGuestClick,
  socialProof,
  note,
  extraFooter,
}: {
  result: SearchResult;
  isLoggedIn: boolean;
  userId?: string | null;
  savedState?: SavedState;
  onSavedChange?: (
    category: "top_list" | "watchlist" | "dont_watch",
    value: boolean,
  ) => void;
  jobTags?: string[];
  onGuestClick?: () => void;
  socialProof?: SocialProofBreakdown;
  note?: string | null;
  extraFooter?: React.ReactNode;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const posterUrl = result.posterPath
    ? `${POSTER_BASE_URL}${result.posterPath}`
    : null;

  return (
    <Card className="overflow-hidden flex flex-col">
      <button
        type="button"
        onClick={() => setShowDetails(true)}
        className="relative aspect-[2/3] w-full bg-muted text-left"
        aria-label={`Details zu ${result.title} anzeigen`}
      >
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={result.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground p-2 text-center">
            Kein Poster
          </div>
        )}
      </button>
      <CardContent className="p-3 flex-1 flex flex-col gap-2">
        <div>
          <p className="text-sm font-medium leading-tight line-clamp-2">
            {result.title}
          </p>
          <MovieMetaBadges details={result.movieDetails} year={result.year} />
          <SocialProofIcons
            breakdown={socialProof}
            onClick={() => setShowDetails(true)}
            className="mt-1"
          />
          {note && (
            <p className="mt-1 text-[11px] italic text-muted-foreground line-clamp-2">
              „{truncateNote(note)}“
            </p>
          )}
          {jobTags && jobTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {jobTags.map((job) => (
                <span
                  key={job}
                  className="shrink-0 text-[10px] font-medium rounded bg-secondary text-secondary-foreground px-1.5 py-0.5"
                >
                  {job}
                </span>
              ))}
            </div>
          )}
        </div>
        <WatchProviderBadges
          providers={result.watchProviders}
          title={result.title}
        />
      </CardContent>
      <CardFooter className="p-3 pt-0 flex flex-col gap-2 items-stretch">
        <SaveButtons
          isLoggedIn={isLoggedIn}
          userId={userId}
          item={{
            itemId: result.id,
            mediaType: result.mediaType,
            title: result.title,
            imageUrl: posterUrl,
            year: result.year,
          }}
          savedState={savedState ?? EMPTY_SAVED_STATE}
          onChange={(category, value) => onSavedChange?.(category, value)}
          onGuestClick={onGuestClick}
          size="compact"
        />
        {extraFooter}
      </CardFooter>

      {showDetails && (
        <MovieDetailModal
          title={result.title}
          posterUrl={posterUrl}
          year={result.year}
          details={result.movieDetails}
          tmdbId={result.id}
          mediaType={result.mediaType}
          socialProof={socialProof}
          note={note}
          onClose={() => setShowDetails(false)}
        />
      )}
    </Card>
  );
}
