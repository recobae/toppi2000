"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { OrteSearchPanel } from "@/components/orte/orte-search-panel";
import { PlaceItemRow, type ListItemRowAttribution } from "@/components/items/list-item-row";
import { PlaceDetailModal } from "@/components/orte/place-detail-modal";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { NoteModal } from "@/components/lists/note-modal";
import { setInteractionWithCredits, recordInspiredCredits } from "@/lib/interaction-credits";
import { recordSkip } from "@/lib/item-skips";
import { savePlaceToRegion, createFreeRegion, updatePlaceNote, type PlaceStatus } from "@/lib/place-items";
import { CreateFreeListModal } from "@/components/orte/create-free-list-modal";
import { CuratedListsSection } from "@/components/inspiration/curated-lists-section";
import type { PlaceSearchResult } from "@/lib/google-places";
import type { CityPlaceRecommendations } from "@/lib/recommendations";
import { CURATED_CITY_LABELS } from "@/lib/places";

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
  const [isSystemAccount, setIsSystemAccount] = useState(false);
  const [showCreateFreeList, setShowCreateFreeList] = useState(false);
  const [recommendations, setRecommendations] = useState<CityPlaceRecommendations | null>(null);
  const [isLoadingCity, setIsLoadingCity] = useState(false);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [pendingPlaceId, setPendingPlaceId] = useState<string | null>(null);
  const [notePrompt, setNotePrompt] = useState<NotePrompt | null>(null);
  const [showDetailsFor, setShowDetailsFor] = useState<PlaceSearchResult | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const cityLimitRef = useRef(12);
  const isReloadingRef = useRef(false);

  useEffect(() => {
    if (!user) {
      setSelectedCity(CURATED_CITY_LABELS[0]);
      return;
    }
    const supabase = createClient();
    (async () => {
      const [{ data: profile }, { data: regionRows }] = await Promise.all([
        supabase.from("profiles").select("home_city, is_system_account").eq("id", user.id).maybeSingle(),
        supabase.from("place_regions").select("region_name").eq("user_id", user.id),
      ]);

      const home = profile?.home_city ?? null;
      setHomeCity(home);
      setIsSystemAccount(profile?.is_system_account ?? false);
      const labels = [...new Set((regionRows ?? []).map((r) => r.region_name))];
      setCityLabels(labels);
      setSelectedCity(home ?? labels[0] ?? null);
    })();
  }, [user]);

  const handleCreateFreeList = async (title: string) => {
    if (!user) return;
    const supabase = createClient();
    const { data, error } = await createFreeRegion(supabase, user.id, title);
    if (error || !data) {
      showToast("Konnte nicht erstellt werden, versuch's nochmal");
      return;
    }
    setCityLabels((prev) => [...new Set([...prev, data.region_name])]);
    setSelectedCity(data.region_name);
  };

  const loadCityRecommendations = useCallback(async (city: string, limit: number) => {
    setIsLoadingCity(true);
    try {
      const response = await fetch(
        `/api/city-places?city=${encodeURIComponent(city)}&limit=${limit}`,
      );
      if (!response.ok) {
        setRecommendations({ fromFriends: [], generic: [] });
        return;
      }
      const data: CityPlaceRecommendations = await response.json();
      setRecommendations(data);
      return data;
    } finally {
      setIsLoadingCity(false);
    }
  }, []);

  useEffect(() => {
    cityLimitRef.current = 12;
    setExhausted(false);
    if (selectedCity) loadCityRecommendations(selectedCity, cityLimitRef.current);
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

  // Every visible suggestion rated -> automatically pull in a bigger batch
  // (rather than leaving the section empty) as long as this city still has
  // more places to surface; once a reload comes back empty too, it's a
  // genuine dead end and stays empty with a clear message instead of
  // retrying forever.
  useEffect(() => {
    if (!recommendations || !selectedCity || isLoadingCity || isReloadingRef.current) return;
    const total = recommendations.fromFriends.length + recommendations.generic.length;
    if (total > 0 || exhausted) return;

    isReloadingRef.current = true;
    const nextLimit = cityLimitRef.current + 24;
    loadCityRecommendations(selectedCity, nextLimit).then((data) => {
      cityLimitRef.current = nextLimit;
      const stillEmpty = !data || data.fromFriends.length + data.generic.length === 0;
      if (stillEmpty) setExhausted(true);
      isReloadingRef.current = false;
    });
  }, [recommendations, selectedCity, isLoadingCity, exhausted, loadCityRecommendations]);

  const handleAdd = async (
    place: PlaceSearchResult,
    recommendedByUsernames: string[],
    status: PlaceStatus,
  ) => {
    if (!user || pendingPlaceId || !selectedCity) return;
    setPendingPlaceId(place.placeId);
    const supabase = createClient();
    try {
      const { error } = await savePlaceToRegion(
        supabase,
        user.id,
        selectedCity,
        place,
        undefined,
        status,
        isSystemAccount,
      );
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
    const previous = recommendations;
    removeFromRecommendations(place.placeId);
    const supabase = createClient();
    const { error } = await setInteractionWithCredits(
      supabase,
      user.id,
      { itemId: place.placeId, mediaType: "place" },
      "dislike",
    );
    if (error) {
      setRecommendations(previous);
      showToast("Konnte nicht gespeichert werden, versuch's nochmal");
    } else {
      showToast("Nicht dein Geschmack? Notiert.");
    }
  };

  const handleSkip = async (place: PlaceSearchResult) => {
    if (!user) return;
    const previous = recommendations;
    removeFromRecommendations(place.placeId);
    const supabase = createClient();
    const { error } = await recordSkip(supabase, user.id, place.placeId, "place");
    if (error) {
      setRecommendations(previous);
      showToast("Konnte nicht gespeichert werden, versuch's nochmal");
    } else {
      // Positive framing (Punkt 6): a skip is a personalization signal, not a rejection.
      showToast("Hilft uns, dich besser zu verstehen");
    }
  };

  // Personalized labels (home city + the user's own region lists) always
  // come first, then the curated fallback fills in the rest -- deduped so a
  // city the user already has doesn't show up twice.
  const personalizedLabels = user
    ? [...new Set([homeCity, ...cityLabels].filter((c): c is string => !!c))]
    : [];
  const personalizedSet = new Set(personalizedLabels);
  const allCityLabels = [
    ...personalizedLabels,
    ...CURATED_CITY_LABELS.filter((city) => !personalizedSet.has(city)),
  ];

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
          onLike: () => handleAdd(place, recommendedBy, "recommended"),
          onDislike: () => handleDislike(place),
          onSkip: () => handleSkip(place),
          onAdd: () => handleAdd(place, recommendedBy, "want_to_visit"),
          addLabel: "Merken",
        }}
      />
    );
  };

  return (
    <div className="w-full flex flex-col gap-4">
      <OrteSearchPanel />

      <CuratedListsSection />

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
            {isSystemAccount && (
              <button
                type="button"
                onClick={() => setShowCreateFreeList(true)}
                className="shrink-0 whitespace-nowrap h-7 px-3 rounded-full border border-dashed border-input text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                + Freie Liste
              </button>
            )}
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
                    {exhausted
                      ? `Keine weiteren Orte-Vorschläge für ${selectedCity} verfügbar.`
                      : "Lädt weitere Vorschläge…"}
                  </p>
                )}
            </>
          )}
        </div>
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

      {showCreateFreeList && (
        <CreateFreeListModal
          onCreate={handleCreateFreeList}
          onClose={() => setShowCreateFreeList(false)}
        />
      )}
    </div>
  );
}
