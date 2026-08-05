"use client";

import { useState } from "react";
import { BackToProfileLink } from "@/components/profile/back-to-profile-link";
import { RegionItemsGrid, ViewToggle, type ViewMode } from "@/components/orte/region-items-grid";
import type { OwnInteractionEntry } from "@/lib/hooks/use-own-interactions";

/**
 * Owns the List/Karte toggle state so it can live in the compact header row
 * (back-link, title, toggle -- one line, title centered) instead of next to
 * the category filter chips further down. The header and RegionItemsGrid
 * are siblings that both need this state, so it has to sit in a shared
 * client ancestor rather than inside RegionItemsGrid itself.
 */
export function RegionPageShell({
  profileUsername,
  regionName,
  regionKey,
  ownerId,
  currentUserId,
  initialOwnInteractions,
}: {
  profileUsername: string;
  regionName: string;
  regionKey: string;
  ownerId: string;
  currentUserId?: string | null;
  initialOwnInteractions?: OwnInteractionEntry[];
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  return (
    <>
      {/*
        Kompakter Kopf: Back-Link, Titel und Liste/Map-Umschalter in einer
        Zeile. Titel bleibt mathematisch zentriert -- links/rechts je ein
        Element gleicher Rolle (Link-Breite links, Toggle-Breite rechts),
        gleiche 3-Spalten-Technik wie der Profil-Header.
      */}
      <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-4">
        <span className="justify-self-start">
          <BackToProfileLink username={profileUsername} />
        </span>
        <h1 className="justify-self-center text-center font-medium text-lg truncate max-w-[50vw]">
          {regionName}
        </h1>
        <span className="justify-self-end">
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </span>
      </div>
      <RegionItemsGrid
        username={profileUsername}
        regionKey={regionKey}
        regionName={regionName}
        ownerId={ownerId}
        currentUserId={currentUserId}
        initialOwnInteractions={initialOwnInteractions}
        viewMode={viewMode}
      />
    </>
  );
}
