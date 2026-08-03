"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  saveRecommendation,
  findSimilarRecommendations,
  type SimilarRecommendation,
} from "@/lib/topf";
import { RECOMMENDATION_CATEGORIES, getRecommendationCategory } from "@/lib/recommendation-categories";
import type { RecommendationMatch } from "@/app/api/recommendations/search-match/route";

type Step = "input" | "confirm";
type FollowedProfile = { id: string; username: string };

const ANTHROPIC_NOT_CONFIGURED_MESSAGE =
  "Die automatische Erkennung ist noch nicht verfügbar -- bitte Titel und Kategorie manuell wählen.";

/**
 * Universal single-entry flow (Abschnitt 4/5): one freetext field -> Claude
 * classify -> editable confirm screen (title/category/note + anchor-API
 * match + freeform fuzzy-duplicate prompt) -> saveRecommendation(). Deckt
 * "Wer empfiehlt das?" zusätzlich zum Wireframe ab, da recommendation_
 * recommenders sonst nie mehr als den Eintragenden selbst kennen würde --
 * ohne diese Auswahl wäre der "3 Freunde empfehlen dasselbe"-Fall aus
 * Wireframe 2 serverseitig nie erreichbar.
 */
export function EntryModal({
  userId,
  initialCategoryKey,
  onClose,
  onSaved,
}: {
  userId: string;
  initialCategoryKey?: string;
  onClose: () => void;
  onSaved: (categoryKey: string) => void;
}) {
  const [step, setStep] = useState<Step>("input");
  const [text, setText] = useState("");
  const [isClassifying, setIsClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [categoryKey, setCategoryKey] = useState<string>(initialCategoryKey ?? "sonstiges");
  const [match, setMatch] = useState<RecommendationMatch | null>(null);
  const [isSearchingMatch, setIsSearchingMatch] = useState(false);
  const [similar, setSimilar] = useState<SimilarRecommendation[]>([]);
  const [mergeIntoId, setMergeIntoId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [followedProfiles, setFollowedProfiles] = useState<FollowedProfile[]>([]);
  const [recommenderUserId, setRecommenderUserId] = useState(userId);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: followRows } = await supabase
        .from("user_follows")
        .select("followed_id")
        .eq("follower_id", userId);
      const followedIds = (followRows ?? []).map((row) => row.followed_id);
      if (followedIds.length === 0) return;
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", followedIds);
      setFollowedProfiles(profiles ?? []);
    })();
  }, [userId]);

  const runMatchAndSimilarity = async (nextCategoryKey: string, nextTitle: string) => {
    const category = getRecommendationCategory(nextCategoryKey);
    setMatch(null);
    setSimilar([]);
    setMergeIntoId(null);
    if (!category || !nextTitle.trim()) return;

    setIsSearchingMatch(true);
    try {
      if (category.group === "freeform") {
        const supabase = createClient();
        const results = await findSimilarRecommendations(supabase, userId, nextCategoryKey, nextTitle);
        setSimilar(results);
        return;
      }

      const response = await fetch("/api/recommendations/search-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryKey: nextCategoryKey, query: nextTitle }),
      });
      if (response.ok) {
        const data: { match: RecommendationMatch | null } = await response.json();
        setMatch(data.match);
        if (data.match) setTitle(data.match.title);
      }
    } finally {
      setIsSearchingMatch(false);
    }
  };

  const handleClassify = async () => {
    const trimmed = text.trim();
    if (!trimmed || isClassifying) return;
    setIsClassifying(true);
    setError(null);
    try {
      const response = await fetch("/api/recommendations/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!response.ok) {
        const data: { error?: string } | null = await response.json().catch(() => null);
        setError(
          data?.error === "ANTHROPIC_API_KEY is not configured"
            ? ANTHROPIC_NOT_CONFIGURED_MESSAGE
            : "Konnte nicht erkannt werden, versuch's nochmal.",
        );
        setTitle(trimmed);
        setCategoryKey(initialCategoryKey ?? "sonstiges");
        setNote("");
        setStep("confirm");
        return;
      }
      const data: { name: string; categoryKey: string; note: string | null } = await response.json();
      setTitle(data.name);
      setCategoryKey(data.categoryKey);
      setNote(data.note ?? "");
      setStep("confirm");
      await runMatchAndSimilarity(data.categoryKey, data.name);
    } finally {
      setIsClassifying(false);
    }
  };

  const handleCategoryChange = (nextCategoryKey: string) => {
    setCategoryKey(nextCategoryKey);
    runMatchAndSimilarity(nextCategoryKey, title);
  };

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const category = getRecommendationCategory(categoryKey);
      const sourceType = category?.group === "place" ? "place" : category?.group === "media" ? "media" : "freeform";

      const { error: saveError } = await saveRecommendation(supabase, {
        userId,
        categoryKey,
        title: trimmedTitle,
        note: note.trim() || null,
        sourceType,
        externalId: match?.externalId ?? null,
        metadata: match?.metadata ?? null,
        recommenderUserId,
        mergeIntoId: mergeIntoId ?? undefined,
      });
      if (saveError) {
        setError("Konnte nicht gespeichert werden, versuch's nochmal");
        return;
      }
      onSaved(categoryKey);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Empfehlen"
    >
      <div
        className="w-full max-w-sm rounded-lg bg-background border p-4 flex flex-col gap-3 max-h-[85vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Empfehlen</p>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        {step === "input" ? (
          <>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) handleClassify();
              }}
              autoFocus
              rows={3}
              placeholder='z. B. "Bella Italia Düsseldorf, super Pasta, für Date Night"'
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="button"
              disabled={isClassifying || !text.trim()}
              onClick={handleClassify}
              className="h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isClassifying ? "Erkennt…" : "Weiter →"}
            </button>
          </>
        ) : (
          <>
            {error && <p className="text-xs text-destructive">{error}</p>}
            {isSearchingMatch && <p className="text-xs text-muted-foreground">Suche Treffer…</p>}

            {match && (
              <div className="flex items-center gap-2 rounded-md border border-dashed p-2">
                {match.imageUrl && (
                  <div className="relative size-10 shrink-0 rounded overflow-hidden bg-muted">
                    <Image src={match.imageUrl} alt="" fill sizes="40px" className="object-cover" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{match.title}</p>
                  {match.subtitle && (
                    <p className="text-[11px] text-muted-foreground truncate">{match.subtitle}</p>
                  )}
                </div>
              </div>
            )}

            {similar.length > 0 && !mergeIntoId && (
              <div className="rounded-md border border-dashed p-2 flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">
                  Ähnlicher Eintrag existiert schon:{" "}
                  <span className="font-medium text-foreground">{similar[0].title}</span> — als weitere
                  Empfehlung dazu, oder trotzdem neu anlegen?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMergeIntoId(similar[0].id)}
                    className="flex-1 h-8 rounded-md border border-input text-xs font-medium hover:bg-accent"
                  >
                    Dazu ergänzen
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimilar([])}
                    className="flex-1 h-8 rounded-md border border-input text-xs font-medium hover:bg-accent"
                  >
                    Neu anlegen
                  </button>
                </div>
              </div>
            )}
            {mergeIntoId && (
              <p className="text-xs text-muted-foreground">
                Wird zu „{similar.find((entry) => entry.id === mergeIntoId)?.title}“ hinzugefügt.{" "}
                <button type="button" onClick={() => setMergeIntoId(null)} className="underline">
                  Ändern
                </button>
              </p>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Titel</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
            </label>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Kategorie</span>
              <div className="flex flex-wrap gap-1.5">
                {RECOMMENDATION_CATEGORIES.map((category) => (
                  <button
                    key={category.key}
                    type="button"
                    onClick={() => handleCategoryChange(category.key)}
                    className={`h-7 px-2.5 rounded-full border text-xs font-medium transition-colors ${
                      categoryKey === category.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input hover:bg-accent"
                    }`}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </div>

            {followedProfiles.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Wer empfiehlt das?</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRecommenderUserId(userId)}
                    className={`h-7 px-2.5 rounded-full border text-xs font-medium transition-colors ${
                      recommenderUserId === userId
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input hover:bg-accent"
                    }`}
                  >
                    Ich selbst
                  </button>
                  {followedProfiles.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setRecommenderUserId(profile.id)}
                      className={`h-7 px-2.5 rounded-full border text-xs font-medium transition-colors ${
                        recommenderUserId === profile.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-input hover:bg-accent"
                      }`}
                    >
                      {profile.username}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Notiz (optional)</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              />
            </label>

            <button
              type="button"
              disabled={isSaving || !title.trim()}
              onClick={handleSave}
              className="h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isSaving ? "Speichert…" : "✓ Bestätigen & speichern"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
