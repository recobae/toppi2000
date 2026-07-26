"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { type ListSummary } from "@/components/search/add-to-list-menu";
import { SearchResultCard } from "@/components/search/search-result-card";
import { PersonSelector } from "@/components/search/person-selector";
import type { PersonSummary, SearchResult } from "@/lib/tmdb";
import type { PersonCreditResult } from "@/app/api/person-credits/route";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

type Toast = { id: number; message: string };
type AddingState = { resultKey: string; listId: string } | null;

export default function SearchPage() {
  const searchParams = useSearchParams();
  const addToListId = searchParams.get("addToList");

  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonSummary | null>(
    null,
  );
  const [personResults, setPersonResults] = useState<PersonCreditResult[]>(
    [],
  );
  const [isLoadingPersonResults, setIsLoadingPersonResults] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(true);
  const [adding, setAdding] = useState<AddingState>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);

      if (!currentUser) {
        setIsLoadingLists(false);
        return;
      }

      const { data, error: listsError } = await supabase
        .from("lists")
        .select("id, title, category")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: true });

      if (!listsError && data) {
        setLists(data);
      }
      setIsLoadingLists(false);
    })();
  }, []);

  const loadPersonCredits = useCallback(async (person: PersonSummary) => {
    setSelectedPerson(person);
    setIsLoadingPersonResults(true);
    try {
      const response = await fetch(
        `/api/person-credits?personId=${person.id}`,
      );
      if (!response.ok) throw new Error("Failed to load person credits");
      const data: { results: PersonCreditResult[] } = await response.json();
      setPersonResults(data.results);
    } catch {
      setPersonResults([]);
    } finally {
      setIsLoadingPersonResults(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    setSelectedPerson(null);
    setPersonResults([]);

    if (!trimmed) {
      setResults([]);
      setPeople([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?query=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error("Search request failed");
        }
        const data: { results: SearchResult[]; people: PersonSummary[] } =
          await response.json();
        setResults(data.results);
        setPeople(data.people);

        if (data.people.length > 0) {
          loadPersonCredits(data.people[0]);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Suche konnte nicht durchgeführt werden.");
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, loadPersonCredits]);

  const handleAddToList = useCallback(
    async (result: SearchResult, list: ListSummary) => {
      const resultKey = `${result.mediaType}-${result.id}`;
      setAdding({ resultKey, listId: list.id });

      try {
        const imageUrl = result.posterPath
          ? `${POSTER_BASE_URL}${result.posterPath}`
          : null;

        const response = await fetch("/api/list-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listId: list.id,
            externalId: result.id,
            title: result.title,
            imageUrl,
            mediaType: result.mediaType,
            year: result.year,
          }),
        });

        const data: { error?: string } = await response.json();

        if (!response.ok) {
          showToast(data.error ?? "Hinzufügen fehlgeschlagen");
          return;
        }

        showToast(`Zu ${list.title} hinzugefügt`);
      } catch {
        showToast("Hinzufügen fehlgeschlagen");
      } finally {
        setAdding(null);
      }
    },
    [showToast],
  );

  const hasPersonSection = people.length > 0;
  const otherPeople = people.filter((p) => p.id !== selectedPerson?.id);
  const noResultsAtAll =
    !isLoading &&
    !error &&
    query.trim().length > 0 &&
    results.length === 0 &&
    people.length === 0;

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg"
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div className="flex-1 w-full flex flex-col gap-6 items-center max-w-5xl p-5">
        <div className="w-full flex flex-col gap-2 pt-8">
          <h1 className="font-medium text-xl">Filme & Serien durchsuchen</h1>
          <div className="relative w-full">
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Titel eingeben…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
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
        </div>

        {isLoading && (
          <p className="w-full text-sm text-muted-foreground">Suche läuft…</p>
        )}
        {error && <p className="w-full text-sm text-destructive">{error}</p>}
        {noResultsAtAll && (
          <p className="w-full text-sm text-muted-foreground">
            Keine Ergebnisse gefunden.
          </p>
        )}

        {otherPeople.length > 0 && (
          <PersonSelector
            people={otherPeople}
            onSelect={loadPersonCredits}
            label="Meintest du eine dieser Personen?"
          />
        )}

        {selectedPerson && (
          <div className="w-full flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Filme & Serien mit {selectedPerson.name}
            </h2>
            {isLoadingPersonResults ? (
              <p className="text-sm text-muted-foreground">
                Werke werden geladen…
              </p>
            ) : personResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine Filme oder Serien für {selectedPerson.name} gefunden.
              </p>
            ) : (
              <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {personResults.map((result) => {
                  const resultKey = `${result.mediaType}-${result.id}`;
                  return (
                    <SearchResultCard
                      key={resultKey}
                      result={result}
                      isLoggedIn={!!user}
                      isLoadingLists={isLoadingLists}
                      lists={lists}
                      addingListId={
                        adding?.resultKey === resultKey
                          ? adding.listId
                          : null
                      }
                      onAdd={(list) => handleAddToList(result, list)}
                      jobTags={result.jobs}
                      preselectedListId={addToListId}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {results.length > 0 && (
          <div className="w-full flex flex-col gap-3">
            {hasPersonSection && (
              <h2 className="text-sm font-medium text-muted-foreground">
                Weitere Treffer
              </h2>
            )}
            <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {results.map((result) => {
                const resultKey = `${result.mediaType}-${result.id}`;
                return (
                  <SearchResultCard
                    key={resultKey}
                    result={result}
                    isLoggedIn={!!user}
                    isLoadingLists={isLoadingLists}
                    lists={lists}
                    addingListId={
                      adding?.resultKey === resultKey ? adding.listId : null
                    }
                    onAdd={(list) => handleAddToList(result, list)}
                    preselectedListId={addToListId}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
