"use client";

import { useRef, useState } from "react";
import { X, Upload, FileText, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { extractNamesFromText } from "@/lib/import-extract";
import { saveToCategory } from "@/lib/saved-items";
import { savePlaceToRegion } from "@/lib/place-items";
import { MovieItemRow, PlaceItemRow } from "@/components/items/list-item-row";
import type { ImportCandidate } from "@/app/api/import/match/route";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w185";

type ImportCategory = "movies" | "orte";
type InputMethod = "text" | "screenshot";
type Step = "input" | "names" | "matches";

function chipClass(active: boolean): string {
  return `inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap h-8 px-3 rounded-full border text-xs font-medium transition-colors ${
    active ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"
  }`;
}

export function ImportModal({
  userId,
  onClose,
  showToast,
}: {
  userId: string;
  onClose: () => void;
  showToast: (message: string) => void;
}) {
  const [category, setCategory] = useState<ImportCategory>("movies");
  const [method, setMethod] = useState<InputMethod>("text");
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [excludedIndices, setExcludedIndices] = useState<Set<number>>(new Set());
  const [movieTarget, setMovieTarget] = useState<"top_list" | "watchlist">("top_list");
  const [placeTarget, setPlaceTarget] = useState<"recommended" | "want_to_visit">("recommended");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFileAsBase64 = (selected: File): Promise<{ base64: string; mediaType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] ?? "";
        resolve({ base64, mediaType: selected.type || "image/png" });
      };
      reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
      reader.readAsDataURL(selected);
    });

  const handleExtract = async () => {
    setError(null);

    if (method === "text") {
      const extracted = extractNamesFromText(text);
      if (extracted.length === 0) {
        setError("Keine Namen im Text gefunden.");
        return;
      }
      setNames(extracted);
      setStep("names");
      return;
    }

    if (!file) {
      setError("Bitte zuerst einen Screenshot auswählen.");
      return;
    }
    setIsExtracting(true);
    try {
      const { base64, mediaType } = await readFileAsBase64(file);
      const response = await fetch("/api/import/extract-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType, category }),
      });
      if (!response.ok) {
        setError("Bilderkennung fehlgeschlagen.");
        return;
      }
      const data: { names: string[] } = await response.json();
      if (data.names.length === 0) {
        setError("Keine Namen im Screenshot erkannt.");
        return;
      }
      setNames(data.names);
      setStep("names");
    } catch {
      setError("Bilderkennung fehlgeschlagen.");
    } finally {
      setIsExtracting(false);
    }
  };

  const updateName = (index: number, value: string) => {
    setNames((prev) => prev.map((name, i) => (i === index ? value : name)));
  };

  const removeName = (index: number) => {
    setNames((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMatch = async () => {
    const cleaned = names.map((name) => name.trim()).filter(Boolean);
    if (cleaned.length === 0) return;
    setIsMatching(true);
    setError(null);
    try {
      const response = await fetch("/api/import/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, names: cleaned }),
      });
      if (!response.ok) {
        setError("Abgleich fehlgeschlagen.");
        return;
      }
      const data: { candidates: ImportCandidate[] } = await response.json();
      setCandidates(data.candidates);
      // Entries with no match start excluded -- nothing to include or save.
      setExcludedIndices(
        new Set(data.candidates.map((c, i) => (c.match ? -1 : i)).filter((i) => i >= 0)),
      );
      setStep("matches");
    } finally {
      setIsMatching(false);
    }
  };

  const toggleExcluded = (index: number) => {
    setExcludedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const matchedEntries = (candidates ?? [])
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.match);
  const unmatchedNames = (candidates ?? []).filter((c) => !c.match).map((c) => c.name);
  const selectedCount = matchedEntries.filter(({ index }) => !excludedIndices.has(index)).length;

  const handleSave = async () => {
    if (selectedCount === 0) return;
    setIsSaving(true);
    const supabase = createClient();
    try {
      let savedCount = 0;
      for (const { candidate, index } of matchedEntries) {
        if (excludedIndices.has(index) || !candidate.match) continue;

        if (candidate.kind === "movie") {
          const match = candidate.match;
          const { error: saveError } = await saveToCategory(supabase, movieTarget, userId, {
            itemId: match.id,
            mediaType: match.mediaType,
            title: match.title,
            imageUrl: match.posterPath ? `${POSTER_BASE_URL}${match.posterPath}` : null,
            year: match.year,
          });
          if (!saveError) savedCount += 1;
        } else {
          const place = candidate.match;
          const geoResponse = await fetch(`/api/reverse-geocode?lat=${place.lat}&lng=${place.lng}`);
          const geoData: { region: string | null } = await geoResponse.json();
          const region = geoData.region ?? "Sonstige Orte";
          const { error: saveError } = await savePlaceToRegion(
            supabase,
            userId,
            region,
            place,
            undefined,
            placeTarget,
          );
          if (!saveError) savedCount += 1;
        }
      }
      showToast(`${savedCount} ${savedCount === 1 ? "Eintrag" : "Einträge"} importiert`);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Liste importieren"
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-lg bg-background border p-5 flex flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Liste importieren</p>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        {step === "input" && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Kategorie</span>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setCategory("movies")} className={chipClass(category === "movies")}>
                  Filme & Serien
                </button>
                <button type="button" onClick={() => setCategory("orte")} className={chipClass(category === "orte")}>
                  Orte
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Quelle</span>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setMethod("text")} className={chipClass(method === "text")}>
                  <FileText className="size-3.5" />
                  Text einfügen
                </button>
                <button type="button" onClick={() => setMethod("screenshot")} className={chipClass(method === "screenshot")}>
                  <Upload className="size-3.5" />
                  Screenshot hochladen
                </button>
              </div>
            </div>

            {method === "text" ? (
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={"Liste einfügen, ein Eintrag pro Zeile…\n\nDune\nThe Bear\nOppenheimer"}
                rows={8}
                className="w-full rounded-md border border-input px-3 py-2 text-sm bg-transparent resize-none"
              />
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-xs file:font-medium file:cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">
                  Screenshot aus Google Maps, TripAdvisor o. ä. -- Namen werden automatisch erkannt.
                </p>
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}

            <Button
              type="button"
              onClick={handleExtract}
              disabled={isExtracting || (method === "text" ? !text.trim() : !file)}
              className="w-full"
            >
              {isExtracting && <Loader2 className="size-4 animate-spin" />}
              Namen extrahieren
            </Button>
          </div>
        )}

        {step === "names" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              {names.length} {names.length === 1 ? "Name" : "Namen"} gefunden -- bei Bedarf korrigieren oder entfernen.
            </p>
            <div className="flex flex-col gap-1.5">
              {names.map((name, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => updateName(index, event.target.value)}
                    className="flex-1 rounded-md border border-input px-2.5 py-1.5 text-sm bg-transparent"
                  />
                  <button
                    type="button"
                    aria-label="Entfernen"
                    onClick={() => removeName(index)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setNames((prev) => [...prev, ""])}
                className="flex items-center justify-center gap-1.5 h-9 rounded-md border-2 border-dashed border-input text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <Plus className="size-3.5" />
                Name hinzufügen
              </button>
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("input")} className="flex-1">
                Zurück
              </Button>
              <Button type="button" onClick={handleMatch} disabled={isMatching} className="flex-1">
                {isMatching && <Loader2 className="size-4 animate-spin" />}
                Treffer suchen
              </Button>
            </div>
          </div>
        )}

        {step === "matches" && candidates && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {category === "movies" ? "Zielliste" : "Status"}
              </span>
              <div className="flex gap-1.5">
                {category === "movies" ? (
                  <>
                    <button type="button" onClick={() => setMovieTarget("top_list")} className={chipClass(movieTarget === "top_list")}>
                      Empfohlen
                    </button>
                    <button type="button" onClick={() => setMovieTarget("watchlist")} className={chipClass(movieTarget === "watchlist")}>
                      Watchlist
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setPlaceTarget("recommended")} className={chipClass(placeTarget === "recommended")}>
                      Empfehlung
                    </button>
                    <button type="button" onClick={() => setPlaceTarget("want_to_visit")} className={chipClass(placeTarget === "want_to_visit")}>
                      Merken
                    </button>
                  </>
                )}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {selectedCount} von {matchedEntries.length} ausgewählt -- einzelne Treffer lassen sich abwählen.
            </p>

            <div className="flex flex-col gap-3">
              {matchedEntries.map(({ candidate, index }) => {
                const isSelected = !excludedIndices.has(index);
                if (candidate.kind === "movie" && candidate.match) {
                  const match = candidate.match;
                  return (
                    <MovieItemRow
                      key={index}
                      imageUrl={match.posterPath ? `${POSTER_BASE_URL}${match.posterPath}` : null}
                      title={match.title}
                      year={match.year}
                      actions={{
                        variant: "simple",
                        isSaved: isSelected,
                        onToggleSave: () => toggleExcluded(index),
                      }}
                    />
                  );
                }
                if (candidate.kind === "place" && candidate.match) {
                  const place = candidate.match;
                  return (
                    <PlaceItemRow
                      key={index}
                      imageUrl={place.photoUrl}
                      name={place.name}
                      category={place.category}
                      address={place.address}
                      rating={place.rating}
                      userRatingCount={place.userRatingCount}
                      actions={{
                        variant: "simple",
                        isSaved: isSelected,
                        onToggleSave: () => toggleExcluded(index),
                      }}
                    />
                  );
                }
                return null;
              })}
            </div>

            {unmatchedNames.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Kein Treffer für: {unmatchedNames.join(", ")}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("names")} className="flex-1">
                Zurück
              </Button>
              <Button type="button" onClick={handleSave} disabled={isSaving || selectedCount === 0} className="flex-1">
                {isSaving && <Loader2 className="size-4 animate-spin" />}
                {selectedCount} {selectedCount === 1 ? "Eintrag" : "Einträge"} importieren
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
