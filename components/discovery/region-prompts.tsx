"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { DiscoverySection } from "@/components/discovery/discovery-section";
import type { DiscoveryCandidate, RegionPrompt } from "@/lib/discovery";

type CityFeed = { friendItems: DiscoveryCandidate[]; moreSuggestions: DiscoveryCandidate[] };

/**
 * "Warst du schon mal hier?" -- cities the viewer's network already has
 * active Orte-lists for. Clicking a tile expands the full suggestion list
 * for that city right here (Auswahl -> Liste -> Vertiefung), not a link
 * away to a teaser.
 */
export function RegionPrompts({ prompts, userId }: { prompts: RegionPrompt[]; userId: string }) {
  const [selected, setSelected] = useState<RegionPrompt | null>(null);
  const [feed, setFeed] = useState<CityFeed | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (prompts.length === 0) return null;

  const selectCity = async (prompt: RegionPrompt) => {
    if (selected?.key === prompt.key) {
      setSelected(null);
      setFeed(null);
      return;
    }
    setSelected(prompt);
    setFeed(null);
    setIsLoading(true);
    const response = await fetch(`/api/discovery-feed/city?city=${encodeURIComponent(prompt.name)}`);
    setFeed(response.ok ? await response.json() : { friendItems: [], moreSuggestions: [] });
    setIsLoading(false);
  };

  return (
    <div className="w-full flex flex-col gap-2.5">
      <h2 className="text-sm font-medium text-muted-foreground">Warst du schon mal hier?</h2>
      <div className="w-full flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {prompts.map((prompt) => {
          const active = selected?.key === prompt.key;
          return (
            <button
              key={prompt.key}
              type="button"
              onClick={() => selectCity(prompt)}
              aria-expanded={active}
              className={`shrink-0 flex flex-col gap-1 w-36 rounded-xl border p-3 text-left shadow-sm hover:shadow-md transition-all ${
                active ? "border-primary bg-primary/5" : "hover:border-primary/40"
              }`}
            >
              <MapPin className={`size-4 ${active ? "text-primary" : "text-primary/80"}`} />
              <span className="text-sm font-medium truncate">{prompt.name}</span>
              <span className="text-[11px] text-muted-foreground leading-snug">
                {prompt.itemCount} {prompt.itemCount === 1 ? "Empfehlung" : "Empfehlungen"} von {prompt.friendCount}{" "}
                {prompt.friendCount === 1 ? "Freund" : "Freunden"}
              </span>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="w-full flex flex-col gap-4 rounded-xl border bg-muted/30 p-3">
          {isLoading ? (
            <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">Lädt…</div>
          ) : (
            <>
              <DiscoverySection
                title={`Empfehlungen aus ${selected.name}`}
                candidates={feed?.friendItems ?? []}
                userId={userId}
              />
              <DiscoverySection
                title={`Weitere Vorschläge in ${selected.name}`}
                candidates={feed?.moreSuggestions ?? []}
                userId={userId}
              />
              {(feed?.friendItems.length ?? 0) === 0 && (feed?.moreSuggestions.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Noch nichts Passendes gefunden -- versuch es später nochmal.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
