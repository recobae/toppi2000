"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { type ListSummary } from "@/components/search/add-to-list-menu";
import { OptionTile } from "@/components/vorschlag/option-tile";
import { SuggestionCard } from "@/components/vorschlag/suggestion-card";
import type { SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

type Toast = { id: number; message: string };
type Step = 1 | 2 | 3;
type MediaType = "movie" | "tv";

const MOOD_OPTIONS: { key: string; label: string }[] = [
  { key: "lustig", label: "Lustig & leicht" },
  { key: "spannend", label: "Spannend & mitreißend" },
  { key: "gruselig", label: "Gruselig" },
  { key: "herzerwaermend", label: "Herzerwärmend" },
  { key: "nachdenken", label: "Zum Nachdenken" },
  { key: "episch", label: "Episch & großartig" },
];

const AUDIENCE_OPTIONS: { key: string; label: string }[] = [
  { key: "allein", label: "Allein" },
  { key: "partner", label: "Partner/in" },
  { key: "familie", label: "Familie mit Kindern" },
  { key: "freunde", label: "Freunde" },
];

const PROVIDER_OPTIONS: { id: number; label: string }[] = [
  { id: 8, label: "Netflix" },
  { id: 9, label: "Prime Video" },
  { id: 337, label: "Disney+" },
  { id: 350, label: "Apple TV+" },
  { id: 29, label: "Sky" },
];

export default function VorschlagPage() {
  const [step, setStep] = useState<Step>(1);
  const [mood, setMood] = useState<string | null>(null);
  const [audience, setAudience] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>("movie");
  const [providerIds, setProviderIds] = useState<number[]>([]);

  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SearchResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [lists, setLists] = useState<ListSummary[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(true);
  const [addingListId, setAddingListId] = useState<string | null>(null);
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

  const toggleProvider = (id: number) => {
    setProviderIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleFindSuggestion = async () => {
    if (!mood || !audience) return;

    setIsLoadingResults(true);
    setHasSearched(true);
    setError(null);
    setCandidates([]);
    setCurrentIndex(null);

    try {
      const params = new URLSearchParams({
        mediaType,
        mood,
        audience,
      });
      if (providerIds.length > 0) {
        params.set("providers", providerIds.join(","));
      }

      const response = await fetch(`/api/discover?${params.toString()}`);
      if (!response.ok) throw new Error("Discover request failed");

      const data: { results: SearchResult[] } = await response.json();
      setCandidates(data.results);
      if (data.results.length > 0) {
        setCurrentIndex(Math.floor(Math.random() * data.results.length));
      }
    } catch {
      setError("Vorschlag konnte nicht geladen werden.");
    } finally {
      setIsLoadingResults(false);
    }
  };

  const handleReroll = () => {
    if (candidates.length <= 1) return;
    setCurrentIndex((prevIndex) => {
      let nextIndex = Math.floor(Math.random() * candidates.length);
      while (nextIndex === prevIndex && candidates.length > 1) {
        nextIndex = Math.floor(Math.random() * candidates.length);
      }
      return nextIndex;
    });
  };

  const handleRestart = () => {
    setStep(1);
    setMood(null);
    setAudience(null);
    setMediaType("movie");
    setProviderIds([]);
    setCandidates([]);
    setCurrentIndex(null);
    setHasSearched(false);
    setError(null);
  };

  const handleAddToList = useCallback(
    async (result: SearchResult, list: ListSummary) => {
      setAddingListId(list.id);

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
        setAddingListId(null);
      }
    },
    [showToast],
  );

  const currentResult =
    currentIndex !== null ? candidates[currentIndex] : null;

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

      <div className="flex-1 w-full flex flex-col gap-6 items-center max-w-2xl p-5">
        <div className="w-full flex flex-col gap-1 pt-8">
          <h1 className="font-medium text-xl">Was soll ich schauen?</h1>
          <p className="text-sm text-muted-foreground">
            Beantworte drei kurze Fragen und erhalte einen Vorschlag.
          </p>
        </div>

        {step === 1 && (
          <div className="w-full flex flex-col gap-3">
            <h2 className="text-sm font-medium">Wonach ist dir?</h2>
            <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-3">
              {MOOD_OPTIONS.map((option) => (
                <OptionTile
                  key={option.key}
                  label={option.label}
                  selected={mood === option.key}
                  onClick={() => {
                    setMood(option.key);
                    setStep(2);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="w-full flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs text-muted-foreground hover:underline w-fit"
            >
              ← Zurück
            </button>
            <h2 className="text-sm font-medium">Mit wem schaust du?</h2>
            <div className="w-full grid grid-cols-2 gap-3">
              {AUDIENCE_OPTIONS.map((option) => (
                <OptionTile
                  key={option.key}
                  label={option.label}
                  selected={audience === option.key}
                  onClick={() => {
                    setAudience(option.key);
                    setStep(3);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="w-full flex flex-col gap-5">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-xs text-muted-foreground hover:underline w-fit"
            >
              ← Zurück
            </button>

            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Film oder Serie?</h2>
              <div className="inline-flex w-fit rounded-lg border p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setMediaType("movie")}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    mediaType === "movie"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                >
                  Film
                </button>
                <button
                  type="button"
                  onClick={() => setMediaType("tv")}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    mediaType === "tv"
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                >
                  Serie
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">
                Welche Streaming-Dienste hast du?
              </h2>
              <div className="flex flex-wrap gap-2">
                {PROVIDER_OPTIONS.map((provider) => {
                  const isSelected = providerIds.includes(provider.id);
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => toggleProvider(provider.id)}
                      className={`min-h-[40px] px-3 rounded-full border text-sm font-medium transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input hover:bg-accent"
                      }`}
                    >
                      {provider.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button onClick={handleFindSuggestion} disabled={isLoadingResults}>
              {isLoadingResults ? "Suche läuft…" : "Vorschlag finden"}
            </Button>
          </div>
        )}

        {error && <p className="w-full text-sm text-destructive">{error}</p>}

        {step === 3 &&
          hasSearched &&
          !isLoadingResults &&
          !error &&
          candidates.length === 0 && (
            <p className="w-full text-sm text-muted-foreground">
              Keine Vorschläge gefunden. Versuche andere Streaming-Dienste.
            </p>
          )}

        {currentResult && (
          <div className="w-full flex flex-col items-center gap-4">
            <SuggestionCard
              result={currentResult}
              isLoggedIn={!!user}
              isLoadingLists={isLoadingLists}
              lists={lists}
              addingListId={addingListId}
              onAdd={(list) => handleAddToList(currentResult, list)}
            />
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button
                variant="secondary"
                onClick={handleReroll}
                disabled={candidates.length <= 1}
              >
                <Shuffle />
                Nochmal vorschlagen
              </Button>
              <button
                type="button"
                onClick={handleRestart}
                className="text-xs text-muted-foreground hover:underline"
              >
                Neue Suche starten
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
