"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { OrteSearchPanel } from "@/components/orte/orte-search-panel";
import { PlaceResultCard } from "@/components/orte/place-result-card";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { NoteModal } from "@/components/lists/note-modal";
import { usePlaceSavedState } from "@/lib/hooks/use-place-saved-state";
import { savePlaceToRegion, updatePlaceNote } from "@/lib/place-items";
import type { PlaceSearchResult } from "@/lib/google-places";
import type { CityPlaceRecommendations } from "@/lib/recommendations";

export function OrteInspirationTab({
  user,
  showToast,
}: {
  user: User | null;
  showToast: (message: string) => void;
}) {
  const [homeCity, setHomeCity] = useState<string | null>(null);
  const [cityLabels, setCityLabels] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<CityPlaceRecommendations | null>(null);
  const [isLoadingCity, setIsLoadingCity] = useState(false);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [pendingPlaceId, setPendingPlaceId] = useState<string | null>(null);
  const [notePrompt, setNotePrompt] = useState<{ place: PlaceSearchResult; region: string } | null>(null);

  const { savedIds, markSaved } = usePlaceSavedState(user?.id);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    (async () => {
      const [{ data: profile }, { data: regionRows }] = await Promise.all([
        supabase.from("profiles").select("home_city").eq("id", user.id).maybeSingle(),
        supabase.from("place_regions").select("region_name").eq("user_id", user.id),
      ]);

      const home = profile?.home_city ?? null;
      setHomeCity(home);
      const labels = [...new Set((regionRows ?? []).map((r) => r.region_name))];
      setCityLabels(labels);
      setSelectedCity(home ?? labels[0] ?? null);
    })();
  }, [user]);

  const loadCityRecommendations = useCallback(async (city: string) => {
    setIsLoadingCity(true);
    try {
      const response = await fetch(`/api/city-places?city=${encodeURIComponent(city)}`);
      if (!response.ok) {
        setRecommendations({ fromFriends: [], generic: [] });
        return;
      }
      const data: CityPlaceRecommendations = await response.json();
      setRecommendations(data);
    } finally {
      setIsLoadingCity(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCity) loadCityRecommendations(selectedCity);
  }, [selectedCity, loadCityRecommendations]);

  const handleToggleSave = async (place: PlaceSearchResult) => {
    if (!user || pendingPlaceId || !selectedCity) return;
    setPendingPlaceId(place.placeId);
    const supabase = createClient();
    try {
      const { error } = await savePlaceToRegion(supabase, user.id, selectedCity, place);
      if (!error) {
        markSaved(place.placeId, true);
        showToast(`Zu „${selectedCity}“ hinzugefügt`);
        setNotePrompt({ place, region: selectedCity });
      }
    } finally {
      setPendingPlaceId(null);
    }
  };

  const allCityLabels = [...new Set([homeCity, ...cityLabels].filter((c): c is string => !!c))];

  return (
    <div className="w-full flex flex-col gap-4">
      <OrteSearchPanel />

      {allCityLabels.length > 0 && (
        <div className="w-full flex flex-col gap-3 border-t pt-4">
          <div className="w-full flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {allCityLabels.map((city) => {
              const isActive = selectedCity === city;
              return (
                <button
                  key={city}
                  type="button"
                  onClick={() => setSelectedCity(city)}
                  className={`shrink-0 whitespace-nowrap h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
                    isActive ? "border-primary bg-primary/10 text-primary" : "border-input hover:bg-accent"
                  }`}
                >
                  {city === homeCity ? `${city} (Zuhause)` : city}
                </button>
              );
            })}
          </div>

          {isLoadingCity ? (
            <p className="text-sm text-muted-foreground">Lädt…</p>
          ) : (
            <>
              {recommendations && recommendations.fromFriends.length > 0 && (
                <div className="w-full flex flex-col gap-3">
                  <h2 className="text-sm font-medium text-muted-foreground">Von deinen Freunden</h2>
                  <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {recommendations.fromFriends.map(({ place, recommendedBy }) => (
                      <PlaceResultCard
                        key={place.placeId}
                        place={place}
                        isLoggedIn={!!user}
                        isSaved={savedIds.has(place.placeId)}
                        isSaving={pendingPlaceId === place.placeId}
                        onToggleSave={() => handleToggleSave(place)}
                        onGuestClick={() => setShowGuestPrompt(true)}
                        note={
                          recommendedBy.length > 0 ? `Empfohlen von ${recommendedBy.join(", ")}` : null
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {recommendations && recommendations.generic.length > 0 && (
                <div className="w-full flex flex-col gap-3">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    Beliebt in {selectedCity}
                  </h2>
                  <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {recommendations.generic.map((place) => (
                      <PlaceResultCard
                        key={place.placeId}
                        place={place}
                        isLoggedIn={!!user}
                        isSaved={savedIds.has(place.placeId)}
                        isSaving={pendingPlaceId === place.placeId}
                        onToggleSave={() => handleToggleSave(place)}
                        onGuestClick={() => setShowGuestPrompt(true)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {recommendations &&
                recommendations.fromFriends.length === 0 &&
                recommendations.generic.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Keine Orte-Vorschläge für {selectedCity} gefunden.
                  </p>
                )}
            </>
          )}
        </div>
      )}

      {allCityLabels.length === 0 && user && (
        <p className="text-sm text-muted-foreground border-t pt-4">
          Hinterlege eine Heimatstadt in den Einstellungen, um hier populäre Orte zu sehen.
        </p>
      )}

      {showGuestPrompt && (
        <GuestSignupModal
          message="Melde dich an, um Orte zu deinen eigenen Listen hinzuzufügen."
          next="/inspiration"
          onClose={() => setShowGuestPrompt(false)}
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
