"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { OrteSearchPanel } from "@/components/orte/orte-search-panel";
import { PlaceItemRow, type ListItemRowAttribution } from "@/components/items/list-item-row";
import { PlaceDetailModal } from "@/components/orte/place-detail-modal";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { NoteModal } from "@/components/lists/note-modal";
import { setInteractionWithCredits, recordInspiredCredits } from "@/lib/interaction-credits";
import { savePlaceToRegion, updatePlaceNote } from "@/lib/place-items";
import type { PlaceSearchResult } from "@/lib/google-places";
import type { CityPlaceRecommendations } from "@/lib/recommendations";

// Shown to guests (no account = no home city / own region lists yet) so the
// Orte tab still has something browsable instead of sitting empty.
const GUEST_DEFAULT_CITIES = ["Berlin", "London", "München", "New York"];

type NotePrompt = { place: PlaceSearchResult; region: string };

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
  const [notePrompt, setNotePrompt] = useState<NotePrompt | null>(null);
  const [showDetailsFor, setShowDetailsFor] = useState<PlaceSearchResult | null>(null);

  useEffect(() => {
    if (!user) {
      setSelectedCity(GUEST_DEFAULT_CITIES[0]);
      return;
    }
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

  const removeFromRecommendations = (placeId: string) => {
    setRecommendations((prev) =>
      prev
        ? {
            fromFriends: prev.fromFriends.filter((entry) => entry.place.placeId !== placeId),
            generic: prev.generic.filter((place) => place.placeId !== placeId),
          }
        : prev,
    );
  };

  const handleAdd = async (place: PlaceSearchResult, recommendedByUsernames: string[]) => {
    if (!user || pendingPlaceId || !selectedCity) return;
    setPendingPlaceId(place.placeId);
    const supabase = createClient();
    try {
      const { error } = await savePlaceToRegion(supabase, user.id, selectedCity, place);
      if (!error) {
        if (recommendedByUsernames.length > 0) {
          // The recommenders' user ids aren't carried on the place row
          // itself -- resolve them so the inspired-credit lands correctly.
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id")
            .in("username", recommendedByUsernames);
          const ownerIds = (profiles ?? []).map((p) => p.id);
          await recordInspiredCredits(supabase, user.id, ownerIds, {
            itemId: place.placeId,
            mediaType: "place",
          });
        }
        showToast(`Zu „${selectedCity}“ hinzugefügt`);
        removeFromRecommendations(place.placeId);
        setNotePrompt({ place, region: selectedCity });
      }
    } finally {
      setPendingPlaceId(null);
    }
  };

  const handleDislike = async (place: PlaceSearchResult) => {
    if (!user) return;
    removeFromRecommendations(place.placeId);
    const supabase = createClient();
    await setInteractionWithCredits(supabase, user.id, { itemId: place.placeId, mediaType: "place" }, "dislike");
    showToast("Nicht dein Geschmack? Notiert.");
  };

  const allCityLabels = user
    ? [...new Set([homeCity, ...cityLabels].filter((c): c is string => !!c))]
    : GUEST_DEFAULT_CITIES;

  const renderPlaceRow = (place: PlaceSearchResult, recommendedBy: string[] = []) => {
    const attribution: ListItemRowAttribution[] | undefined =
      recommendedBy.length > 0 ? [{ label: "Empfohlen von", names: recommendedBy }] : undefined;
    return (
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
        attribution={attribution}
        onOpenDetails={() => setShowDetailsFor(place)}
        isLoggedIn={!!user}
        onGuestClick={() => setShowGuestPrompt(true)}
        actions={{
          variant: "rate",
          pending: pendingPlaceId === place.placeId,
          onLike: () => handleAdd(place, recommendedBy),
          onDislike: () => handleDislike(place),
          onAdd: () => handleAdd(place, recommendedBy),
          addLabel: "Merken",
        }}
      />
    );
  };

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
                  <div className="w-full flex flex-col gap-3">
                    {recommendations.fromFriends.map(({ place, recommendedBy }) =>
                      renderPlaceRow(place, recommendedBy),
                    )}
                  </div>
                </div>
              )}

              {recommendations && recommendations.generic.length > 0 && (
                <div className="w-full flex flex-col gap-3">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    Beliebt in {selectedCity}
                  </h2>
                  <div className="w-full flex flex-col gap-3">
                    {recommendations.generic.map((place) => renderPlaceRow(place))}
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
