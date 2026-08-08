"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { MovieItemRow } from "@/components/items/list-item-row";
import { MovieDetailModal } from "@/components/movie-info";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { PersonSelector } from "@/components/search/person-selector";
import { NoteModal } from "@/components/lists/note-modal";
import { saveToCategory, updateNote } from "@/lib/saved-items";
import { applyItemRating, addItemToOwnList } from "@/lib/rating-engine";
import { CATEGORY_LABELS } from "@/lib/categories";
import { NOTE_PLACEHOLDERS } from "@/lib/notes";
import type { PersonSummary, SearchResult } from "@/lib/tmdb";
import type { PersonCreditResult } from "@/app/api/person-credits/route";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

type NotePrompt = {
  title: string;
  imageUrl: string | null;
  category: "top_list" | "watchlist";
  itemId: number;
  mediaType: "movie" | "tv";
};

/**
 * The Filme & Serien search experience (input, results, save flow) as a
 * self-contained panel -- the one implementation of "search TMDb and save a
 * result" left after the old Inspiration page (trending browse, friends-
 * likes feed -- all now redundant with "Für Dich") was removed. Mirrors
 * components/orte/orte-search-panel.tsx's shape for the movie/tv side.
 */
export function MovieSearchPanel() {
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

  const [user, setUser] = useState<User | null>(null);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [notePrompt, setNotePrompt] = useState<NotePrompt | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);
    })();
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadPersonCredits = async (person: PersonSummary) => {
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
  };

  useEffect(() => {
    const trimmed = query.trim();
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
  }, [query]);

  const handleLike = async (result: SearchResult) => {
    if (!user) return;
    const key = `${result.mediaType}-${result.id}`;
    setPendingKey(key);
    const supabase = createClient();
    const posterUrl = result.posterPath ? `${POSTER_BASE_URL}${result.posterPath}` : null;
    // Search results have no known owner -- a plain "Lohnt sich" with no
    // credits, same as before this migrated onto the shared rating engine.
    await applyItemRating(supabase, user.id, { itemId: String(result.id), mediaType: result.mediaType }, "lohnt_sich");
    const { error } = await addItemToOwnList(supabase, user.id, {
      kind: "movie",
      category: "top_list",
      item: { itemId: result.id, mediaType: result.mediaType, title: result.title, imageUrl: posterUrl, year: result.year },
    });
    if (!error) {
      showToast(`Zu ${CATEGORY_LABELS.top_list} hinzugefügt`);
      setNotePrompt({ title: result.title, imageUrl: posterUrl, category: "top_list", itemId: result.id, mediaType: result.mediaType });
    }
    setPendingKey(null);
  };

  const handleDislike = async (result: SearchResult) => {
    if (!user) return;
    const key = `${result.mediaType}-${result.id}`;
    setPendingKey(key);
    const supabase = createClient();
    const { error } = await applyItemRating(
      supabase,
      user.id,
      { itemId: String(result.id), mediaType: result.mediaType },
      "lohnt_sich_nicht",
    );
    showToast(error ? "Konnte nicht gespeichert werden, versuch's nochmal" : "Notiert.");
    setPendingKey(null);
  };

  const handleUnknown = async (result: SearchResult) => {
    if (!user) return;
    const key = `${result.mediaType}-${result.id}`;
    setPendingKey(key);
    const supabase = createClient();
    await applyItemRating(supabase, user.id, { itemId: String(result.id), mediaType: result.mediaType }, "kenne_ich_nicht");
    setPendingKey(null);
  };

  const handleWatchlist = async (result: SearchResult) => {
    if (!user) return;
    const key = `${result.mediaType}-${result.id}`;
    setPendingKey(key);
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
      setNotePrompt({ title: result.title, imageUrl: posterUrl, category: "watchlist", itemId: result.id, mediaType: result.mediaType });
    }
    setPendingKey(null);
  };

  const renderResultRow = (result: SearchResult) => {
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
        onOpenDetails={() => setShowDetailsFor(result)}
        isLoggedIn={!!user}
        onGuestClick={() => setShowGuestModal(true)}
        actions={{
          variant: "rate",
          pending: pendingKey === key,
          onLike: () => handleLike(result),
          onDislike: () => handleDislike(result),
          onUnknown: () => handleUnknown(result),
          onAdd: () => handleWatchlist(result),
          addLabel: "Watchlist",
        }}
      />
    );
  };

  const otherPeople = people.filter((p) => p.id !== selectedPerson?.id);

  return (
    <div className="w-full flex flex-col gap-4">
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">{toastMessage}</div>
        </div>
      )}

      <div className="relative w-full">
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="Titel, Serie oder Person suchen…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={query ? "pr-8" : undefined}
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

      {isSearching && <p className="text-sm text-muted-foreground">Suche läuft…</p>}
      {searchError && <p className="text-sm text-destructive">{searchError}</p>}
      {otherPeople.length > 0 && (
        <PersonSelector people={otherPeople} onSelect={loadPersonCredits} label="Meintest du eine dieser Personen?" />
      )}
      {selectedPerson && (
        <div className="w-full flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Filme & Serien mit {selectedPerson.name}</h2>
          {isLoadingPersonResults ? (
            <p className="text-sm text-muted-foreground">Werke werden geladen…</p>
          ) : (
            <div className="w-full flex flex-col gap-3">{personResults.map((result) => renderResultRow(result))}</div>
          )}
        </div>
      )}
      {!isSearching && !searchError && query.trim() && results.length === 0 && people.length === 0 && (
        <p className="text-sm text-muted-foreground">Keine Ergebnisse gefunden.</p>
      )}
      {results.length > 0 && <div className="w-full flex flex-col gap-3">{results.map((result) => renderResultRow(result))}</div>}

      {showDetailsFor && (
        <MovieDetailModal
          title={showDetailsFor.title}
          posterUrl={showDetailsFor.posterPath ? `${POSTER_BASE_URL}${showDetailsFor.posterPath}` : null}
          year={showDetailsFor.year}
          details={showDetailsFor.movieDetails}
          tmdbId={showDetailsFor.id}
          mediaType={showDetailsFor.mediaType}
          watchProviders={showDetailsFor.watchProviders}
          onClose={() => setShowDetailsFor(null)}
        />
      )}

      {showGuestModal && (
        <GuestSignupModal
          message="Melde dich an, um Filme & Serien zu deinen eigenen Listen hinzuzufügen."
          next="/hinzufuegen"
          onClose={() => setShowGuestModal(false)}
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
            await updateNote(supabase, notePrompt.category, user.id, notePrompt.itemId, notePrompt.mediaType, note);
          }}
          onClose={() => setNotePrompt(null)}
        />
      )}
    </div>
  );
}
