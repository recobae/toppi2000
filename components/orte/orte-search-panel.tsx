"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { NoteModal } from "@/components/lists/note-modal";
import { PlaceDetailModal } from "@/components/orte/place-detail-modal";
import { PlaceItemRow } from "@/components/items/list-item-row";
import { usePlaceSavedState } from "@/lib/hooks/use-place-saved-state";
import { savePlaceToRegion, removePlace, updatePlaceNote } from "@/lib/place-items";
import { PLACES_EXPERTISE_MIN_ITEMS } from "@/lib/places";
import type { PlaceSearchResult } from "@/lib/google-places";

type Toast = { id: number; message: string };

/**
 * The Orte search experience (input, results, save flow) as a
 * self-contained panel embedded in the Inspiration page's Orte tab -- the
 * one implementation of "search Google Places and save a result" (the old
 * standalone /orte page duplicating this has been removed).
 */
export function OrteSearchPanel() {
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [pendingPlaceId, setPendingPlaceId] = useState<string | null>(null);
  const [notePrompt, setNotePrompt] = useState<{
    place: PlaceSearchResult;
    region: string;
  } | null>(null);
  const [showDetailsFor, setShowDetailsFor] = useState<PlaceSearchResult | null>(null);

  const { savedIds, markSaved } = usePlaceSavedState(user?.id);

  const showToast = (message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);
    })();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
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
          `/api/places-search?query=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        const data: {
          results: PlaceSearchResult[];
          error?: string;
        } = await response.json();

        if (data.error) {
          setNotConfigured(true);
          setResults([]);
        } else {
          setResults(data.results);
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
  }, [query]);

  const handleToggleSave = async (place: PlaceSearchResult) => {
    if (!user || pendingPlaceId) return;
    setPendingPlaceId(place.placeId);
    const supabase = createClient();

    try {
      if (savedIds.has(place.placeId)) {
        const { error: removeError } = await removePlace(supabase, user.id, place.placeId);
        if (!removeError) {
          markSaved(place.placeId, false);
          showToast("Entfernt");
        }
        return;
      }

      const geoResponse = await fetch(`/api/reverse-geocode?lat=${place.lat}&lng=${place.lng}`);
      const geoData: { region: string | null } = await geoResponse.json();
      const region = geoData.region ?? "Sonstige Orte";

      const { error: saveError, regionItemCount } = await savePlaceToRegion(
        supabase,
        user.id,
        region,
        place,
      );

      if (saveError) {
        showToast("Speichern fehlgeschlagen");
        return;
      }

      markSaved(place.placeId, true);
      showToast(`Zu „${region}“ hinzugefügt`);

      if (regionItemCount === 1) {
        showToast(
          `Noch ${PLACES_EXPERTISE_MIN_ITEMS - 1} Orte, dann bist du offiziell der ${region}-Experte für deine Freunde!`,
        );
      }

      setNotePrompt({ place, region });
    } finally {
      setPendingPlaceId(null);
    }
  };

  return (
    <div className="w-full flex flex-col gap-6 items-center">
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg"
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div className="relative w-full">
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="Restaurant, Bar, Sehenswürdigkeit…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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

      {notConfigured && (
        <p className="w-full text-sm text-muted-foreground">
          Orte-Suche ist noch nicht eingerichtet (fehlender Google-API-Key).
        </p>
      )}
      {isLoading && <p className="w-full text-sm text-muted-foreground">Suche läuft…</p>}
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
      {!isLoading && !error && !notConfigured && query.trim() && results.length === 0 && (
        <p className="w-full text-sm text-muted-foreground">Keine Orte gefunden.</p>
      )}

      {results.length > 0 && (
        <div className="w-full flex flex-col gap-3">
          {results.map((place) => (
            <PlaceItemRow
              key={place.placeId}
              imageUrl={place.photoUrl}
              name={place.name}
              category={place.category}
              address={place.address}
              rating={place.rating}
              userRatingCount={place.userRatingCount}
              openingStatus={place.openingStatus}
              priceLevel={place.priceLevel}
              phoneNumber={place.phoneNumber}
              websiteUri={place.websiteUri}
              onOpenDetails={() => setShowDetailsFor(place)}
              isLoggedIn={!!user}
              onGuestClick={() => setShowGuestModal(true)}
              actions={{
                variant: "simple",
                isSaved: savedIds.has(place.placeId),
                pending: pendingPlaceId === place.placeId,
                onToggleSave: () => handleToggleSave(place),
              }}
            />
          ))}
        </div>
      )}

      {showDetailsFor && (
        <PlaceDetailModal
          name={showDetailsFor.name}
          address={showDetailsFor.address}
          category={showDetailsFor.category}
          photoUrl={showDetailsFor.photoUrl}
          lat={showDetailsFor.lat}
          lng={showDetailsFor.lng}
          googleMapsUri={showDetailsFor.googleMapsUri}
          rating={showDetailsFor.rating}
          userRatingCount={showDetailsFor.userRatingCount}
          priceLevel={showDetailsFor.priceLevel}
          phoneNumber={showDetailsFor.phoneNumber}
          websiteUri={showDetailsFor.websiteUri}
          openingStatus={showDetailsFor.openingStatus}
          onClose={() => setShowDetailsFor(null)}
        />
      )}

      {showGuestModal && (
        <GuestSignupModal
          message="Melde dich an, um Orte zu deinen eigenen Listen hinzuzufügen."
          next="/inspiration?tab=orte"
          onClose={() => setShowGuestModal(false)}
        />
      )}

      {notePrompt && user && (
        <NoteModal
          title={notePrompt.place.name}
          posterUrl={notePrompt.place.photoUrl}
          initialNote={null}
          placeholder="Was macht diesen Ort besonders?"
          onSave={async (note) => {
            const supabase = createClient();
            await updatePlaceNote(supabase, user.id, notePrompt.place.placeId, note);
          }}
          onClose={() => setNotePrompt(null)}
        />
      )}
    </div>
  );
}
