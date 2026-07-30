"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { SearchResultCard } from "@/components/search/search-result-card";
import { FriendFeedMovieCard, type FriendFeedMovieItem } from "@/components/inspo/friend-feed-movie-card";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { PersonSelector } from "@/components/search/person-selector";
import { useSocialProof, getSocialProofBreakdown } from "@/lib/hooks/use-social-proof";
import { useSavedState, getSavedState } from "@/lib/hooks/use-saved-state";
import { saveToCategory, updateNote } from "@/lib/saved-items";
import { setInteractionWithCredits, recordInspiredCredits } from "@/lib/interaction-credits";
import { CATEGORY_LABELS, type SavedCategory } from "@/lib/categories";
import { NOTE_PLACEHOLDERS, SKIP_ADD_NOTE_PROMPT } from "@/lib/notes";
import { NoteModal } from "@/components/lists/note-modal";
import { SORT_FILTERS, GENRE_FILTERS } from "@/lib/movie-genres";
import type { PersonSummary, SearchResult } from "@/lib/tmdb";
import type { PersonCreditResult } from "@/app/api/person-credits/route";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";
const FRIENDS_LIKES_KEY = "__friends_likes__";

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
  // ---- Friend feed (reuses the same cards/handlers as the old Inspo page) ----
  const [feedItems, setFeedItems] = useState<FriendFeedMovieItem[] | null>(null);

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

  const handleFeedInteraction = async (
    item: FriendFeedMovieItem,
    type: "like" | "dislike" | "skip",
  ) => {
    if (!user) return;
    removeFeedItem(item.itemId, item.mediaType);
    const supabase = createClient();
    await setInteractionWithCredits(
      supabase,
      user.id,
      { itemId: item.itemId, mediaType: item.mediaType },
      type,
      item.topList.userIds,
    );
    if (type === "like") showToast("Gefällt mir gemerkt");
    if (type === "dislike") showToast("Nicht dein Geschmack? Notiert.");
  };

  const handleFeedAdd = async (item: FriendFeedMovieItem, category: SavedCategory) => {
    if (!user) return;
    removeFeedItem(item.itemId, item.mediaType);
    const supabase = createClient();
    const ownerUserIds = item.topList.userIds;
    const { error } = await saveToCategory(
      supabase,
      category,
      user.id,
      {
        itemId: Number(item.itemId),
        mediaType: item.mediaType,
        title: item.title,
        imageUrl: item.imageUrl,
        year: item.year,
      },
      ownerUserIds[0] ?? null,
    );
    if (error) {
      showToast("Aktion fehlgeschlagen");
      return;
    }
    await recordInspiredCredits(supabase, user.id, ownerUserIds, {
      itemId: item.itemId,
      mediaType: item.mediaType,
    });
    showToast(`Zu ${CATEGORY_LABELS[category]} hinzugefügt`);
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
  const hasActiveFilter = sortFilter !== null || genreFilter !== null;

  const [showGuestModal, setShowGuestModal] = useState(false);
  const [notePrompt, setNotePrompt] = useState<{ result: SearchResult; category: SavedCategory } | null>(
    null,
  );

  const fetchBrowse = useCallback(async () => {
    setIsLoadingBrowse(true);
    try {
      const params = new URLSearchParams({ page: "1" });
      let url: string;
      if (hasActiveFilter) {
        params.set("sort", sortFilter ?? "popular");
        if (genreFilter) params.set("genre", genreFilter);
        url = `/api/discover-movies?${params.toString()}`;
      } else {
        url = `/api/trending?${params.toString()}`;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error("failed");
      const data: { results: SearchResult[] } = await response.json();
      setBrowseItems(data.results);
    } catch {
      // leave whatever is already loaded in place
    } finally {
      setIsLoadingBrowse(false);
    }
  }, [hasActiveFilter, sortFilter, genreFilter]);

  useEffect(() => {
    fetchBrowse();
  }, [fetchBrowse]);

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

  const handleTrendingDislike = async (result: SearchResult) => {
    if (!user) {
      setShowGuestModal(true);
      return;
    }
    removeFromBrowse(result);
    const supabase = createClient();
    await setInteractionWithCredits(
      supabase,
      user.id,
      { itemId: String(result.id), mediaType: result.mediaType },
      "dislike",
    );
    showToast("Nicht dein Geschmack? Notiert.");
  };

  const socialProofItems = [...browseItems, ...friendsLikes, ...results, ...personResults];
  const socialProofMap = useSocialProof(
    socialProofItems.map((r) => ({ id: r.id, mediaType: r.mediaType })),
  );
  const { stateMap, markSaved } = useSavedState(
    socialProofItems.map((r) => ({ id: r.id, mediaType: r.mediaType })),
  );

  const handleSavedChange = (result: SearchResult, category: SavedCategory, value: boolean) => {
    markSaved(result.id, result.mediaType, category, value);
    if (value) removeFromBrowse(result);
    showToast(
      value ? `Zu ${CATEGORY_LABELS[category]} hinzugefügt` : `Aus ${CATEGORY_LABELS[category]} entfernt`,
    );
    if (value && !SKIP_ADD_NOTE_PROMPT.includes(category)) {
      setNotePrompt({ result, category });
    }
  };

  const hasFeedItems = (feedItems?.length ?? 0) > 0;
  const isSearchActive = query.trim().length > 0 || !!selectedPerson;
  const otherPeople = people.filter((p) => p.id !== selectedPerson?.id);

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
                <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {personResults.map((result) => (
                    <SearchResultCard
                      key={`${result.mediaType}-${result.id}`}
                      result={result}
                      isLoggedIn={!!user}
                      userId={user?.id}
                      savedState={getSavedState(stateMap, result.id, result.mediaType)}
                      onSavedChange={(category, value) => handleSavedChange(result, category, value)}
                      onGuestClick={() => setShowGuestModal(true)}
                      jobTags={result.jobs}
                      socialProof={getSocialProofBreakdown(socialProofMap, result.id, result.mediaType)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          {!isSearching && !searchError && results.length === 0 && people.length === 0 && (
            <p className="text-sm text-muted-foreground">Keine Ergebnisse gefunden.</p>
          )}
          {results.length > 0 && (
            <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {results.map((result) => (
                <SearchResultCard
                  key={`${result.mediaType}-${result.id}`}
                  result={result}
                  isLoggedIn={!!user}
                  userId={user?.id}
                  savedState={getSavedState(stateMap, result.id, result.mediaType)}
                  onSavedChange={(category, value) => handleSavedChange(result, category, value)}
                  onGuestClick={() => setShowGuestModal(true)}
                  socialProof={getSocialProofBreakdown(socialProofMap, result.id, result.mediaType)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {hasFeedItems && (
            <div className="w-full flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">Von deinen Freunden</h2>
              <div className="w-full flex flex-col gap-3">
                {feedItems!.map((item) => (
                  <FriendFeedMovieCard
                    key={`${item.mediaType}-${item.itemId}`}
                    item={item}
                    isLoggedIn={!!user}
                    onInteraction={(type) => handleFeedInteraction(item, type)}
                    onAdd={(category) => handleFeedAdd(item, category)}
                    onGuestClick={() => setShowGuestModal(true)}
                  />
                ))}
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
                  Noch keine Likes von Freunden, denen du folgst.
                </p>
              ) : (
                <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {friendsLikes.map((result) => (
                    <SearchResultCard
                      key={`${FRIENDS_LIKES_KEY}-${result.mediaType}-${result.id}`}
                      result={result}
                      isLoggedIn={!!user}
                      userId={user?.id}
                      savedState={getSavedState(stateMap, result.id, result.mediaType)}
                      onSavedChange={(category, value) => handleSavedChange(result, category, value)}
                      onGuestClick={() => setShowGuestModal(true)}
                      socialProof={getSocialProofBreakdown(socialProofMap, result.id, result.mediaType)}
                    />
                  ))}
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
                <p className="text-sm text-muted-foreground">Keine Titel gefunden.</p>
              ) : (
                <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {browseItems.map((result) => (
                    <SearchResultCard
                      key={`${result.mediaType}-${result.id}`}
                      result={result}
                      isLoggedIn={!!user}
                      userId={user?.id}
                      savedState={getSavedState(stateMap, result.id, result.mediaType)}
                      onSavedChange={(category, value) => handleSavedChange(result, category, value)}
                      onGuestClick={() => setShowGuestModal(true)}
                      socialProof={getSocialProofBreakdown(socialProofMap, result.id, result.mediaType)}
                      onDislike={!hasActiveFilter ? () => handleTrendingDislike(result) : undefined}
                    />
                  ))}
                </div>
              )}
              {!hasActiveFilter && !isLoadingBrowse && browseItems.length > 0 && (
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

      {notePrompt && user && (
        <NoteModal
          title={notePrompt.result.title}
          posterUrl={notePrompt.result.posterPath ? `${POSTER_BASE_URL}${notePrompt.result.posterPath}` : null}
          initialNote={null}
          placeholder={NOTE_PLACEHOLDERS[notePrompt.category]}
          onSave={async (note) => {
            const supabase = createClient();
            await updateNote(
              supabase,
              notePrompt.category,
              user.id,
              notePrompt.result.id,
              notePrompt.result.mediaType,
              note,
            );
          }}
          onClose={() => setNotePrompt(null)}
        />
      )}
    </div>
  );
}
