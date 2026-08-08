"use client";

import { useState } from "react";
import { Check, HelpCircle, MapPin, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DiscoverySection } from "@/components/discovery/discovery-section";
import { getRegionFamiliarity, setRegionFamiliarity, type RegionFamiliarityStatus } from "@/lib/region-familiarity";
import type { DiscoveryCandidate, RegionPrompt } from "@/lib/discovery";

type CityFeed = { friendItems: DiscoveryCandidate[]; moreSuggestions: DiscoveryCandidate[] };

const FAMILIARITY_OPTIONS: { status: RegionFamiliarityStatus; label: string; icon: typeof Check }[] = [
  { status: "visited", label: "War ich schon dort", icon: Check },
  { status: "unknown", label: "Kenne ich noch nicht", icon: HelpCircle },
  { status: "want_to_explore", label: "Möchte ich entdecken", icon: Star },
];

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
  const [familiarity, setFamiliarity] = useState<RegionFamiliarityStatus | null>(null);
  const [familiarityPending, setFamiliarityPending] = useState(false);

  if (prompts.length === 0) return null;

  const selectCity = async (prompt: RegionPrompt) => {
    if (selected?.key === prompt.key) {
      setSelected(null);
      setFeed(null);
      return;
    }
    setSelected(prompt);
    setFeed(null);
    setFamiliarity(null);
    setIsLoading(true);
    const supabase = createClient();
    const [feedResponse, familiarityStatus] = await Promise.all([
      fetch(`/api/discovery-feed/city?city=${encodeURIComponent(prompt.name)}`),
      getRegionFamiliarity(supabase, userId, prompt.key),
    ]);
    setFeed(feedResponse.ok ? await feedResponse.json() : { friendItems: [], moreSuggestions: [] });
    setFamiliarity(familiarityStatus);
    setIsLoading(false);
  };

  const chooseFamiliarity = async (status: RegionFamiliarityStatus) => {
    if (!selected || familiarityPending) return;
    setFamiliarityPending(true);
    const supabase = createClient();
    const { error } = await setRegionFamiliarity(supabase, userId, selected.key, selected.name, status);
    if (!error) setFamiliarity(status);
    setFamiliarityPending(false);
  };

  return (
    <div className="w-full flex flex-col gap-2.5">
      <h2 className="text-sm font-medium text-muted-foreground">Wo warst du schon mal?</h2>
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
              {/*
                "Wo warst du schon mal?" -- eigenes, von der Orts-Bewertung
                (item_interactions) getrenntes Signal je Stadt/Region
                (region_familiarity), Lohnt-sich-Umbau §4.
              */}
              <div className="w-full flex items-center gap-1.5">
                {FAMILIARITY_OPTIONS.map(({ status, label, icon: Icon }) => {
                  const active = familiarity === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-label={label}
                      aria-pressed={active}
                      disabled={familiarityPending}
                      onClick={() => chooseFamiliarity(status)}
                      className={`flex-1 flex items-center justify-center gap-1 h-8 rounded-full border text-[11px] font-medium transition-colors disabled:opacity-50 ${
                        active ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      <Icon className="size-3.5 shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
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
