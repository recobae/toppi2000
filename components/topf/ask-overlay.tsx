"use client";

import { useRef, useState } from "react";
import { Mic, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MovieItemRow } from "@/components/items/list-item-row";
import { MovieDetailModal } from "@/components/movie-info";
import { setInteractionWithCredits } from "@/lib/interaction-credits";
import { saveToCategory } from "@/lib/saved-items";
import type { AskAnswer } from "@/app/api/topf/ask/route";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

// Not in every browser (Firefox/Safari support is partial) -- feature-
// detected below so the mic button simply doesn't render where it's
// unsupported, rather than showing a broken control.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * "Frag einfach..." (Wireframe 3): voice or text feed the exact same input
 * and answer rendering -- no separate "voice mode" UI. Voice is a progressive
 * enhancement (Web Speech API) that quietly disappears where unsupported.
 */
export function AskOverlay({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [pending, setPending] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const SpeechRecognitionCtor = getSpeechRecognition();

  const handleAsk = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isAsking) return;
    setIsAsking(true);
    setError(null);
    setAnswer(null);
    try {
      const response = await fetch("/api/topf/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      if (!response.ok) {
        setError("Konnte keine Antwort finden, versuch's nochmal.");
        return;
      }
      const data: { answer: AskAnswer | null } = await response.json();
      if (!data.answer) {
        setError("Noch keine Empfehlungen von deinen Freunden gefunden.");
        return;
      }
      setAnswer(data.answer);
    } finally {
      setIsAsking(false);
    }
  };

  const toggleListening = () => {
    if (!SpeechRecognitionCtor) return;
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "de-DE";
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = event.results.map((result) => result[0]?.transcript ?? "").join(" ");
      setQuestion(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const handleRateAction = async (target: "like" | "dislike" | "watchlist") => {
    if (!answer || pending) return;
    setPending(true);
    const supabase = createClient();
    const item = answer.result;
    const posterUrl = item.posterPath ? `${POSTER_BASE_URL}${item.posterPath}` : null;

    const { error: writeError } =
      target === "watchlist"
        ? await saveToCategory(supabase, "watchlist", userId, {
            itemId: item.id,
            mediaType: item.mediaType,
            title: item.title,
            imageUrl: posterUrl,
            year: item.year,
          })
        : target === "like"
          ? await saveToCategory(supabase, "top_list", userId, {
              itemId: item.id,
              mediaType: item.mediaType,
              title: item.title,
              imageUrl: posterUrl,
              year: item.year,
            })
          : await setInteractionWithCredits(
              supabase,
              userId,
              { itemId: String(item.id), mediaType: item.mediaType },
              "dislike",
            );

    if (writeError) {
      showToast("Konnte nicht gespeichert werden, versuch's nochmal");
      setPending(false);
      return;
    }
    showToast(
      target === "watchlist" ? "Zu Watchlist hinzugefügt" : target === "like" ? "Zu Empfohlen hinzugefügt" : "Notiert.",
    );
    setAnswer(null);
    setQuestion("");
    setPending(false);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Frag einfach"
    >
      <div
        className="w-full max-w-sm rounded-lg bg-background border p-4 flex flex-col gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Frag einfach...</p>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleAsk(question);
            }}
            autoFocus
            placeholder='z. B. "Was soll ich heute schauen, hab Bock auf was Lustiges"'
            className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
          {SpeechRecognitionCtor && (
            <button
              type="button"
              aria-label={isListening ? "Aufnahme stoppen" : "Sprechen"}
              onClick={toggleListening}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                isListening ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-accent"
              }`}
            >
              <Mic className="size-4" />
            </button>
          )}
        </div>

        <button
          type="button"
          disabled={isAsking || !question.trim()}
          onClick={() => handleAsk(question)}
          className="h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isAsking ? "Sucht…" : "Fragen"}
        </button>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {answer && (
          <div className="flex flex-col gap-2 pt-1 border-t">
            <p className="text-xs text-muted-foreground pt-2">
              {answer.reason}
              {answer.recommendedBy.length > 0 && ` — ${answer.recommendedBy.join(" und ")} haben das geliked`}
            </p>
            <MovieItemRow
              imageUrl={answer.result.posterPath ? `${POSTER_BASE_URL}${answer.result.posterPath}` : null}
              title={answer.result.title}
              year={answer.result.year}
              movieDetails={answer.result.movieDetails}
              watchProviders={answer.result.watchProviders}
              onOpenDetails={() => setShowDetails(true)}
              actions={{
                variant: "rate",
                pending,
                onLike: () => handleRateAction("like"),
                onDislike: () => handleRateAction("dislike"),
                onAdd: () => handleRateAction("watchlist"),
                addLabel: "Watchlist",
              }}
            />
          </div>
        )}

        {toastMessage && (
          <div className="fixed bottom-4 right-4 z-50">
            <div className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
              {toastMessage}
            </div>
          </div>
        )}
      </div>

      {showDetails && answer && (
        <MovieDetailModal
          title={answer.result.title}
          posterUrl={answer.result.posterPath ? `${POSTER_BASE_URL}${answer.result.posterPath}` : null}
          year={answer.result.year}
          details={answer.result.movieDetails}
          tmdbId={answer.result.id}
          mediaType={answer.result.mediaType}
          onClose={() => setShowDetails(false)}
        />
      )}
    </div>
  );
}
