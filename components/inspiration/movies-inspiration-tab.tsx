"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { MovieItemRow, type ListItemRowAttribution } from "@/components/items/list-item-row";
import { MovieDetailModal } from "@/components/movie-info";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { PersonSelector } from "@/components/search/person-selector";
import { useSocialProof, getSocialProofBreakdown } from "@/lib/hooks/use-social-proof";
import { saveToCategory, updateNote } from "@/lib/saved-items";
import { setInteractionWithCredits, recordInspiredCredits } from "@/lib/interaction-credits";
import { recordSkip } from "@/lib/item-skips";
import { CATEGORY_LABELS } from "@/lib/categories";
import { NOTE_PLACEHOLDERS } from "@/lib/notes";
import { NoteModal } from "@/components/lists/note-modal";
import { SORT_FILTERS, GENRE_FILTERS } from "@/lib/movie-genres";
import type { PersonSummary, SearchResult } from "@/lib/tmdb";
import type { PersonCreditResult } from "@/app/api/person-credits/route";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

export type FriendFeedMovieItem = {
  itemId: string;
  mediaType: "movie" | "tv";
  title: string;
  imageUrl: string | null;
  year: string | null;
  addedAt: string;
  topList: { count: number; names: string[]; userIds: string[] };
  liked: { count: number; names: string[]; userIds: string[] };
  disliked: { count: number; names: string[]; userIds: string[] };
};

type NotePrompt = {
  title: string;
  imageUrl: string | null;
  category: "top_list" | "watchlist";
  itemId: number;
  mediaType: "movie" | "tv";
};

function feedAttribution(item: FriendFeedMovieItem): ListItemRowAttribution[] {
  return [
    { label: "Empfohlen von", names: item.topList.names },
    { label: "Geliked von", names: item.liked.names, className: "text-green-600" },
    { label: "Nicht gemocht von", names: item.disliked.names, className: "text-destructive" },
  ];
}

export function MoviesInspirationTab({
  user,
  showToast,
  addToLabel,
  deepLinkPerson,
}: {
  user: User | null;
  showToast: (message: string) => void;
  addToLabel?: string | null;
  deepLinkPerson?: { id: string; name: string } | null;
}) {
  // ---- Friend feed ----
  const [feedItems, setFeedItems] = useState<FriendFeedMovieItem[] | null>(null);
  const [feedPendingKey, setFeedPendingKey] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    const response = await fetch("/api/friend-feed?type=movies");
    if (!response.ok) return;
    const data: { items: FriendFeedMovieItem[] } = await response.json();
    setFeedItems(data.items);
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const removeFeedItem = (itemId: string, mediaType: string) => {
    setFeedItems((prev) =>
      (prev ?? []).filter((item) => !(item.itemId === itemId && item.mediaType === mediaType)),
    );
  };

  const [notePrompt, setNotePrompt] = useState<NotePrompt | null>(null);

  const handleFeedLike = async (item: FriendFeedMovieItem) => {
    if (!user) return;
    setFeedPendingKey(`${item.mediaType}-${item.itemId}`);
    const supabase = createClient();
    const ownerUserIds = item.topList.userIds;
    await setInteractionWithCredits(
      supabase,
      user.id,
      { itemId: item.itemId, mediaType: item.mediaType },
      "like",
      ownerUserIds,
    );
    const { error } = await saveToCategory(
      supabase,
      "top_list",
      user.id,
      { itemId: Number(item.itemId), mediaType: item.mediaType, title: item.title, imageUrl: item.imageUrl, year: item.year },
      ownerUserIds[0] ?? null,
    );
    if (!error) {
      await recordInspiredCredits(supabase, user.id, ownerUserIds, { itemId: item.itemId, mediaType: item.mediaType });
      showToast(`Zu ${CATEGORY_LABELS.top_list} hinzugefügt`);
      setNotePrompt({
        title: item.title,
        imageUrl: item.imageUrl,
        category: "top_list",
        itemId: Number(item.itemId),
        mediaType: item.mediaType,
      });
    }
    removeFeedItem(item.itemId, item.mediaType);
    setFeedPendingKey(null);
  };

  const handleFeedDislike = async (item: FriendFeedMovieItem) => {
    if (!user) return;
    setFeedPendingKey(`${item.mediaType}-${item.itemId}`);
    const supabase = createClient();
    const { error } = await setInteractionWithCredits(
      supabase,
      user.id,
      { itemId: item.itemId, mediaType: item.mediaType },
      "dislike",
      item.topList.userIds,
    );
    if (error) {
      showToast("Konnte nicht gespeichert werden, versuch's nochmal");
    } else {
      showToast("Nicht dein Geschmack? Notiert.");
      removeFeedItem(item.itemId, item.mediaType);
    }
    setFeedPendingKey(null);
  };

  const handleFeedWatchlist = async (item: FriendFeedMovieItem) => {
    if (!user) return;
    setFeedPendingKey(`${item.mediaType}-${item.itemId}`);
    const supabase = createClient();
    const ownerUserIds = item.topList.userIds;
    const { error } = await saveToCategory(
      supabase,
      "watchlist",
      user.id,
      { itemId: Number(item.itemId), mediaType: item.mediaType, title: item.title, imageUrl: item.imageUrl, year: item.year },
      ownerUserIds[0] ?? null,
    );
    if (!error) {
      await recordInspiredCredits(supabase, user.id, ownerUserIds, { itemId: item.itemId, mediaType: item.mediaType });
      showToast(`Zu ${CATEGORY_LABELS.watchlist} hinzugefügt`);
      setNotePrompt({
        title: item.title,
        imageUrl: item.imageUrl,
        category: "watchlist",
        itemId: Number(item.itemId),
        mediaType: item.mediaType,
      });
    }
    removeFeedItem(item.itemId, item.mediaType);
    setFeedPendingKey(null);
  };

  const handleFeedSkip = async (item: FriendFeedMovieItem) => {
    if (!user) return;
    const supabase = createClient();
    await recordSkip(supabase, user.id, item.itemId, item.mediaType);
    // Positive framing (Punkt 6): a skip is a personalization signal, not a rejection.
    showToast("Hilft uns, dich besser zu verstehen");
    removeFeedItem(item.itemId, item.mediaType);
  };

  // ---- Search ----
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonSummary | null>(null);
  const [personResults, setPersonResults] = useState<PersonCreditResult[]>([]);
  const [isLoadingPersonResults, setIsLoadingPersonResults] = useState(false);
  const [showDetailsFor, setShowDetailsFor] = useState<SearchResult | null>(null);

  const loadPersonCredits = useCallback(async (person: PersonSummary) => {
    setSelectedPerson(person);
    setIsLoadingPersonResults(true);
    try {
      const response = await fetch(`/api/person-credits?personId=${person.id}`);
      if (!response.ok) throw new Error("failed");
      const data: { results: PersonCreditResult[] } = await response.json();
      setPersonResults(data.results);
    } catch {
      setPersonResults([]);
    } finally {
      setIsLoadingPersonResults(false);
    }
  }, []);

  useEffect(() => {
    if (deepLinkPerson) {
      const id = Number(deepLinkPerson.id);
      if (Number.isFinite(id)) {
        loadPersonCredits({ id, name: deepLinkPerson.name, profilePath: null });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkPerson]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed && deepLinkPerson) {
      // A deep-linked person filmography owns the display while no text has
      // been typed -- don't let this effect's mount-time run wipe it out.
      return;
    }
    setSelectedPerson(null);
    setPersonResults([]);

    if (!trimmed) {
      setResults([]);
      setPeople([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);
    setSearchError(null);

    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?query=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("failed");
        const data: { results: SearchResult[]; people: PersonSummary[] } = await response.json();
        setResults(data.results);
        setPeople(data.people);
        if (data.people.length > 0) loadPersonCredits(data.people[0]);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSearchError("Suche konnte nicht durchgeführt werden.");
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, loadPersonCredits, deepLinkPerson]);

  // ---- Filter chips + default trending feed ----
  const [sortFilter, setSortFilter] = useState<string | null>(null);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [friendsLikesActive, setFriendsLikesActive] = useState(false);
  const [friendsLikes, setFriendsLikes] = useState<SearchResult[]>([]);
  const [isLoadingFriendsLikes, setIsLoadingFriendsLikes] = useState(false);
  const [browseItems, setBrowseItems] = useState<SearchResult[]>([]);
  const [isLoadingBrowse, setIsLoadingBrowse] = useState(true);
  const [isLoadingMoreBrowse, setIsLoadingMoreBrowse] = useState(false);
  const [browsePendingKey, setBrowsePendingKey] = useState<string | null>(null);
  const hasActiveFilter = sortFilter !== null || genreFilter !== null;

  const [showGuestModal, setShowGuestModal] = useState(false);

  const browsePageRef = useRef(1);
  const browseSeenKeysRef = useRef<Set<string>>(new Set());
  const isFetchingBrowseRef = useRef(false);

  const browseUrl = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page) });
      if (hasActiveFilter) {
        params.set("sort", sortFilter ?? "popular");
        if (genreFilter) params.set("genre", genreFilter);
        return `/api/discover-movies?${params.toString()}`;
      }
      return `/api/trending?${params.toString()}`;
    },
    [hasActiveFilter, sortFilter, genreFilter],
  );

  const fetchMoreBrowse = useCallback(async () => {
    if (isFetchingBrowseRef.current) return;
    isFetchingBrowseRef.current = true;
    setIsLoadingMoreBrowse(true);
    try {
      const nextPage = browsePageRef.current + 1;
      const response = await fetch(browseUrl(nextPage));
      if (!response.ok) throw new Error("failed");
      const data: { results: SearchResult[] } = await response.json();
      browsePageRef.current = nextPage;
      const fresh = data.results.filter((r) => {
        const key = `${r.mediaType}-${r.id}`;
        if (browseSeenKeysRef.current.has(key)) return false;
        browseSeenKeysRef.current.add(key);
        return true;
      });
      setBrowseItems((prev) => [...prev, ...fresh]);
    } catch {
      // leave whatever is already loaded in place
    } finally {
      isFetchingBrowseRef.current = false;
      setIsLoadingMoreBrowse(false);
    }
  }, [browseUrl]);

  const fetchBrowse = useCallback(async () => {
    setIsLoadingBrowse(true);
    browsePageRef.current = 1;
    browseSeenKeysRef.current = new Set();
    try {
      const response = await fetch(browseUrl(1));
      if (!response.ok) throw new Error("failed");
      const data: { results: SearchResult[] } = await response.json();
      for (const r of data.results) browseSeenKeysRef.current.add(`${r.mediaType}-${r.id}`);
      setBrowseItems(data.results);
    } catch {
      // leave whatever is already loaded in place
    } finally {
      setIsLoadingBrowse(false);
    }
  }, [browseUrl]);

  useEffect(() => {
    fetchBrowse();
  }, [fetchBrowse]);

  // Every visible suggestion rated -> pull in the next page automatically
  // instead of leaving the feed empty while more unrated items exist.
  useEffect(() => {
    if (!isLoadingBrowse && browseItems.length === 0) {
      fetchMoreBrowse();
    }
  }, [browseItems.length, isLoadingBrowse, fetchMoreBrowse]);

  const loadFriendsLikes = useCallback(async () => {
    setIsLoadingFriendsLikes(true);
    try {
      const response = await fetch("/api/friends-likes");
      if (!response.ok) return;
      const data: { results: SearchResult[] } = await response.json();
      setFriendsLikes(data.results);
    } finally {
      setIsLoadingFriendsLikes(false);
    }
  }, []);

  const toggleFriendsLikes = () => {
    const next = !friendsLikesActive;
    setFriendsLikesActive(next);
    if (next) {
      setSortFilter(null);
      setGenreFilter(null);
      loadFriendsLikes();
    }
  };

  const removeFromBrowse = (result: SearchResult) => {
    setBrowseItems((prev) => prev.filter((r) => !(r.id === result.id && r.mediaType === result.mediaType)));
  };

  const genericLike = async (result: SearchResult, removeAfter?: (r: SearchResult) => void) => {
    if (!user) return;
    const key = `${result.mediaType}-${result.id}`;
    setBrowsePendingKey(key);
    const supabase = createClient();
    const posterUrl = result.posterPath ? `${POSTER_BASE_URL}${result.posterPath}` : null;
    const { error } = await saveToCategory(supabase, "top_list", user.id, {
      itemId: result.id,
      mediaType: result.mediaType,
      title: result.title,
      imageUrl: posterUrl,
      year: result.year,
    });
    if (!error) {
      showToast(`Zu ${CATEGORY_LABELS.top_list} hinzugefügt`);
      setNotePrompt({
        title: result.title,
        imageUrl: posterUrl,
        category: "top_list",
        itemId: result.id,
        mediaType: result.mediaType,
      });
      removeAfter?.(result);
    }
    setBrowsePendingKey(null);
  };

  const genericDislike = async (result: SearchResult, removeAfter?: (r: SearchResult) => void) => {
    if (!user) return;
    const key = `${result.mediaType}-${result.id}`;
    setBrowsePendingKey(key);
    const supabase = createClient();
    const { error } = await setInteractionWithCredits(
      supabase,
      user.id,
      { itemId: String(result.id), mediaType: result.mediaType },
      "dislike",
    );
    if (error) {
      showToast("Konnte nicht gespeichert werden, versuch's nochmal");
    } else {
      showToast("Nicht dein Geschmack? Notiert.");
      removeAfter?.(result);
    }
    setBrowsePendingKey(null);
  };

  const genericWatchlist = async (result: SearchResult, removeAfter?: (r: SearchResult) => void) => {
    if (!user) return;
    const key = `${result.mediaType}-${result.id}`;
    setBrowsePendingKey(key);
    const supabase = createClient();
    const posterUrl = result.posterPath ? `${POSTER_BASE_URL}${result.posterPath}` : null;
    const { error } = await saveToCategory(supabase, "watchlist", user.id, {
      itemId: result.id,
      mediaType: result.mediaType,
      title: result.title,
      imageUrl: posterUrl,
      year: result.year,
    });
    if (!error) {
      showToast(`Zu ${CATEGORY_LABELS.watchlist} hinzugefügt`);
      setNotePrompt({
        title: result.title,
        imageUrl: posterUrl,
        category: "watchlist",
        itemId: result.id,
        mediaType: result.mediaType,
      });
      removeAfter?.(result);
    }
    setBrowsePendingKey(null);
  };

  const genericSkip = async (result: SearchResult, removeAfter?: (r: SearchResult) => void) => {
    if (!user) return;
    const key = `${result.mediaType}-${result.id}`;
    setBrowsePendingKey(key);
    const supabase = createClient();
    await recordSkip(supabase, user.id, String(result.id), result.mediaType);
    // Positive framing (Punkt 6): a skip is a personalization signal, not a rejection.
    showToast("Hilft uns, dich besser zu verstehen");
    removeAfter?.(result);
    setBrowsePendingKey(null);
  };

  const socialProofItems = [...browseItems, ...friendsLikes, ...results, ...personResults];
  const socialProofMap = useSocialProof(
    socialProofItems.map((r) => ({ id: r.id, mediaType: r.mediaType })),
  );

  const hasFeedItems = (feedItems?.length ?? 0) > 0;
  const isSearchActive = query.trim().length > 0 || !!selectedPerson;
  const otherPeople = people.filter((p) => p.id !== selectedPerson?.id);

  const renderResultRow = (result: SearchResult, removeAfter?: (r: SearchResult) => void) => {
    const key = `${result.mediaType}-${result.id}`;
    const posterUrl = result.posterPath ? `${POSTER_BASE_URL}${result.posterPath}` : null;
    return (
      <MovieItemRow
        key={key}
        imageUrl={posterUrl}
        title={result.title}
        year={result.year}
        movieDetails={result.movieDetails}
        watchProviders={result.watchProviders}
        socialProof={getSocialProofBreakdown(socialProofMap, result.id, result.mediaType)}
        onOpenDetails={() => setShowDetailsFor(result)}
        isLoggedIn={!!user}
        onGuestClick={() => setShowGuestModal(true)}
        actions={{
          variant: "rate",
          pending: browsePendingKey === key,
          onLike: () => genericLike(result, removeAfter),
          onDislike: () => genericDislike(result, removeAfter),
          onSkip: () => genericSkip(result, removeAfter),
          onAdd: () => genericWatchlist(result, removeAfter),
          addLabel: "Watchlist",
        }}
      />
    );
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {addToLabel && (
        <p className="text-xs text-muted-foreground">
          Füge einen Titel zu &bdquo;{addToLabel}&ldquo; hinzu
        </p>
      )}
      <div className="relative w-full">
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="Titel, Serie oder Person suchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`h-9 text-sm ${query ? "pr-8" : ""}`}
        />
        {query && (
          <button
            type="button"
            aria-label="Suche zurücksetzen"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => {
              setQuery("");
              searchInputRef.current?.focus();
            }}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {isSearchActive ? (
        <div className="w-full flex flex-col gap-4">
          {isSearching && <p className="text-sm text-muted-foreground">Suche läuft…</p>}
          {searchError && <p className="text-sm text-destructive">{searchError}</p>}
          {otherPeople.length > 0 && (
            <PersonSelector people={otherPeople} onSelect={loadPersonCredits} label="Meintest du eine dieser Personen?" />
          )}
          {selectedPerson && (
            <div className="w-full flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                Filme & Serien mit {selectedPerson.name}
              </h2>
              {isLoadingPersonResults ? (
                <p className="text-sm text-muted-foreground">Werke werden geladen…</p>
              ) : (
                <div className="w-full flex flex-col gap-3">
                  {personResults.map((result) => renderResultRow(result))}
                </div>
              )}
            </div>
          )}
          {!isSearching && !searchError && results.length === 0 && people.length === 0 && (
            <p className="text-sm text-muted-foreground">Keine Ergebnisse gefunden.</p>
          )}
          {results.length > 0 && (
            <div className="w-full flex flex-col gap-3">
              {results.map((result) => renderResultRow(result))}
            </div>
          )}
        </div>
      ) : (
        <>
          {hasFeedItems && (
            <div className="w-full flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">Von deinen Freunden</h2>
              <div className="w-full flex flex-col gap-3">
                {feedItems!.map((item) => {
                  const key = `${item.mediaType}-${item.itemId}`;
                  return (
                    <MovieItemRow
                      key={key}
                      imageUrl={item.imageUrl}
                      title={item.title}
                      year={item.year}
                      attribution={feedAttribution(item)}
                      isLoggedIn={!!user}
                      onGuestClick={() => setShowGuestModal(true)}
                      actions={{
                        variant: "rate",
                        pending: feedPendingKey === key,
                        onLike: () => handleFeedLike(item),
                        onDislike: () => handleFeedDislike(item),
                        onSkip: () => handleFeedSkip(item),
                        onAdd: () => handleFeedWatchlist(item),
                        addLabel: "Watchlist",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="w-full flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {user && (
              <button
                type="button"
                onClick={toggleFriendsLikes}
                className={`shrink-0 whitespace-nowrap h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
                  friendsLikesActive ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"
                }`}
              >
                Likes meiner Freunde
              </button>
            )}
            {SORT_FILTERS.map((option) => {
              const isActive = sortFilter === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    setFriendsLikesActive(false);
                    setSortFilter(isActive ? null : option.key);
                  }}
                  className={`shrink-0 whitespace-nowrap h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
                    isActive ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
            <div className="w-px shrink-0 self-stretch bg-border" />
            {GENRE_FILTERS.map((genre) => {
              const isActive = genreFilter === genre.id;
              return (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => {
                    setFriendsLikesActive(false);
                    setGenreFilter(isActive ? null : genre.id);
                  }}
                  className={`shrink-0 whitespace-nowrap h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
                    isActive ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"
                  }`}
                >
                  {genre.label}
                </button>
              );
            })}
          </div>

          {friendsLikesActive ? (
            <div className="w-full flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">Likes meiner Freunde</h2>
              {isLoadingFriendsLikes ? (
                <p className="text-sm text-muted-foreground">Lädt…</p>
              ) : friendsLikes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Noch keine Likes von Personen, die dich inspirieren.
                </p>
              ) : (
                <div className="w-full flex flex-col gap-3">
                  {friendsLikes.map((result) => renderResultRow(result))}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">
                {hasActiveFilter ? "Filme & Serien entdecken" : "Trending diese Woche"}
              </h2>
              {isLoadingBrowse ? (
                <p className="text-sm text-muted-foreground">Lädt…</p>
              ) : browseItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {isLoadingMoreBrowse ? "Lädt weitere Vorschläge…" : "Keine Titel gefunden."}
                </p>
              ) : (
                <div className="w-full flex flex-col gap-3">
                  {browseItems.map((result) => renderResultRow(result, removeFromBrowse))}
                </div>
              )}
              {isLoadingMoreBrowse && browseItems.length > 0 && (
                <p className="text-xs text-muted-foreground text-center">Lädt weitere Vorschläge…</p>
              )}
              {!isLoadingBrowse && browseItems.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-fit self-center text-xs text-muted-foreground"
                  onClick={fetchBrowse}
                >
                  Neu laden
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {showGuestModal && (
        <GuestSignupModal
          message="Melde dich an, um Titel zu deinen eigenen Listen hinzuzufügen."
          next="/inspiration"
          onClose={() => setShowGuestModal(false)}
        />
      )}

      {showDetailsFor && (
        <MovieDetailModal
          title={showDetailsFor.title}
          posterUrl={showDetailsFor.posterPath ? `${POSTER_BASE_URL}${showDetailsFor.posterPath}` : null}
          year={showDetailsFor.year}
          details={showDetailsFor.movieDetails}
          tmdbId={showDetailsFor.id}
          mediaType={showDetailsFor.mediaType}
          socialProof={getSocialProofBreakdown(socialProofMap, showDetailsFor.id, showDetailsFor.mediaType)}
          onClose={() => setShowDetailsFor(null)}
        />
      )}

      {notePrompt && user && (
        <NoteModal
          title={notePrompt.title}
          posterUrl={notePrompt.imageUrl}
          initialNote={null}
          placeholder={NOTE_PLACEHOLDERS[notePrompt.category]}
          onSave={async (note) => {
            const supabase = createClient();
            await updateNote(
              supabase,
              notePrompt.category,
              user.id,
              notePrompt.itemId,
              notePrompt.mediaType,
              note,
            );
          }}
          onClose={() => setNotePrompt(null)}
        />
      )}
    </div>
  );
}
