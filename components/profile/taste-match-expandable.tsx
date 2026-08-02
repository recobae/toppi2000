"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { formatTasteMatchLabel, type TasteMatch } from "@/lib/taste-match";
import type { TasteMatchDetailEntry } from "@/app/api/taste-match-details/route";

type Details = { movies: TasteMatchDetailEntry[]; places: TasteMatchDetailEntry[] };

function DetailRow({ entry }: { entry: TasteMatchDetailEntry }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative size-8 shrink-0 rounded overflow-hidden bg-muted">
        {entry.imageUrl && (
          <Image src={entry.imageUrl} alt={entry.title} fill sizes="32px" className="object-cover" />
        )}
      </div>
      <p className="flex-1 min-w-0 text-xs font-medium truncate">{entry.title}</p>
      <span
        className={`shrink-0 text-[10px] font-medium ${
          entry.agreement === "like" ? "text-green-600" : "text-destructive"
        }`}
      >
        {entry.agreement === "like" ? "Beide: Ja" : "Beide: Nein"}
      </span>
    </div>
  );
}

/**
 * Wraps the compact Taste-Match line ("Filme: 87% · Orte: 62%") with a
 * click-to-expand breakdown of the actual shared ratings behind it -- same
 * spirit as "Meine Aktivität", just scoped to items both this profile's
 * owner and the viewer independently agreed on (see
 * app/api/taste-match-details/route.ts, itself built on the same
 * getSharedRatings() computeTasteMatch uses for the percentage).
 */
export function TasteMatchExpandable({
  username,
  tasteMatch,
}: {
  username: string;
  tasteMatch: TasteMatch;
}) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<Details | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const toggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !details) {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/taste-match-details?username=${encodeURIComponent(username)}`);
        if (response.ok) setDetails(await response.json());
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex items-center gap-1.5 hover:text-foreground transition-colors"
      >
        <Sparkles className="size-4 text-primary" />
        <span>{formatTasteMatchLabel(tasteMatch)}</span>
        {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>

      {expanded && (
        <div className="w-full max-w-sm flex flex-col gap-3 rounded-lg border p-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center">Lädt…</p>
          ) : details && (details.movies.length > 0 || details.places.length > 0) ? (
            <>
              {details.movies.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Filme & Serien</p>
                  {details.movies.map((entry) => (
                    <DetailRow key={`${entry.mediaType}-${entry.itemId}`} entry={entry} />
                  ))}
                </div>
              )}
              {details.places.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Orte</p>
                  {details.places.map((entry) => (
                    <DetailRow key={`${entry.mediaType}-${entry.itemId}`} entry={entry} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              Noch keine gemeinsamen Bewertungen.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
