import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { WatchProviderBadges } from "@/components/watch-provider-badges";
import {
  AddToListMenu,
  filterListsForMediaType,
  type ListSummary,
} from "@/components/search/add-to-list-menu";
import type { SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";

export function SuggestionCard({
  result,
  isLoggedIn,
  isLoadingLists,
  lists,
  addingListId,
  onAdd,
}: {
  result: SearchResult;
  isLoggedIn: boolean;
  isLoadingLists: boolean;
  lists: ListSummary[];
  addingListId: string | null;
  onAdd: (list: ListSummary) => void;
}) {
  return (
    <Card className="overflow-hidden w-full max-w-xl">
      <div className="flex flex-col sm:flex-row">
        <div className="relative aspect-[2/3] w-full sm:w-52 shrink-0 bg-muted">
          {result.posterPath ? (
            <Image
              src={`${POSTER_BASE_URL}${result.posterPath}`}
              alt={result.title}
              fill
              sizes="(max-width: 640px) 100vw, 208px"
              className="object-cover"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground p-2 text-center">
              Kein Poster
            </div>
          )}
        </div>
        <CardContent className="p-4 flex-1 flex flex-col gap-3">
          <div>
            <p className="text-lg font-semibold leading-tight">
              {result.title}
            </p>
            <p className="text-sm text-muted-foreground">
              {result.year ?? "—"} · {result.mediaType === "movie" ? "Film" : "Serie"}
            </p>
          </div>
          {result.overview && (
            <p className="text-sm text-muted-foreground line-clamp-5">
              {result.overview}
            </p>
          )}
          <WatchProviderBadges
            providers={result.watchProviders}
            title={result.title}
          />
          <div className="mt-auto pt-1">
            <AddToListMenu
              isLoggedIn={isLoggedIn}
              isLoadingLists={isLoadingLists}
              lists={filterListsForMediaType(lists, result.mediaType)}
              addingListId={addingListId}
              onAdd={onAdd}
            />
          </div>
        </CardContent>
      </div>
    </Card>
  );
}
