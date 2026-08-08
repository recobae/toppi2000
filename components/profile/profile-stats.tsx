"use client";

import { useState } from "react";
import { InspiredItemsModal } from "@/components/profile/inspired-items-modal";

/**
 * Die beiden erlaubten Fremdprofil-Statistiken (Profil-Umbau, Punkt 4+5) --
 * blau "Schon X Bewertungen abgegeben" (kein Username mehr, gleiche
 * Gewichtung wie forMeStatus's blauer "Bewertungen von Freunden"-Text in
 * app/fuer-dich/page.tsx), grün "X mal von Dir inspiriert" -- jetzt klickbar,
 * öffnet die Detailansicht der tatsächlich inspirierten Items.
 */
export function ProfileStats({
  totalActivityCount,
  inspiredCount,
  viewerId,
  ownerId,
  ownerUsername,
}: {
  totalActivityCount: number;
  inspiredCount: number;
  viewerId: string;
  ownerId: string;
  ownerUsername: string;
}) {
  const [showInspired, setShowInspired] = useState(false);

  return (
    <div className="w-full flex flex-col items-center gap-1">
      <p className="text-sm font-medium text-center text-blue-600">
        Schon {totalActivityCount} {totalActivityCount === 1 ? "Bewertung" : "Bewertungen"} abgegeben
      </p>
      <button
        type="button"
        onClick={() => setShowInspired(true)}
        disabled={inspiredCount === 0}
        aria-label={`${inspiredCount} mal von Dir inspiriert -- Items anzeigen`}
        className="text-sm font-medium text-center text-green-600 disabled:cursor-default enabled:hover:underline"
      >
        {inspiredCount} mal von Dir inspiriert
      </button>

      {showInspired && (
        <InspiredItemsModal
          actorUserId={viewerId}
          ownerUserId={ownerId}
          ownerUsername={ownerUsername}
          onClose={() => setShowInspired(false)}
        />
      )}
    </div>
  );
}
