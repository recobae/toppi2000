"use client";

import { useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { WatchProviderBadges } from "@/components/watch-provider-badges";
import { MovieMetaBadges, MovieDetailModal } from "@/components/movie-info";
import {
  AddToListMenu,
  filterListsForMediaType,
  type ListSummary,
} from "@/components/search/add-to-list-menu";
import type { SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

export function SearchResultCard({
  result,
  isLoggedIn,
  isLoadingLists,
  lists,
  addingListId,
  onAdd,
  jobTags,
  preselectedListId,
}: {
  result: SearchResult;
  isLoggedIn: boolean;
  isLoadingLists: boolean;
  lists: ListSummary[];
  addingListId: string | null;
  onAdd: (list: ListSummary) => void;
  jobTags?: string[];
  preselectedListId?: string | null;
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
      <CardFooter className="p-3 pt-0">
        <AddToListMenu
          isLoggedIn={isLoggedIn}
          isLoadingLists={isLoadingLists}
          lists={filterListsForMediaType(lists, result.mediaType)}
          addingListId={addingListId}
          onAdd={onAdd}
          preselectedListId={preselectedListId}
        />
      </CardFooter>

      {showDetails && (
        <MovieDetailModal
          title={result.title}
          posterUrl={posterUrl}
          year={result.year}
          details={result.movieDetails}
          onClose={() => setShowDetails(false)}
        />
      )}
    </Card>
  );
}
