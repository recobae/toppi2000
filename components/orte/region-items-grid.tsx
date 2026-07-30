"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { NoteModal } from "@/components/lists/note-modal";
import { PlaceDetailModal } from "@/components/orte/place-detail-modal";
import { PlaceItemRow } from "@/components/items/list-item-row";
import { removePlace, savePlaceToRegion, updatePlaceNote } from "@/lib/place-items";
import { setInteractionWithCredits, removeInteractionWithCredits } from "@/lib/interaction-credits";
import {
  PLACE_CATEGORIES,
  PLACE_CATEGORY_ICONS,
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
  type PlacePriceLevel,
} from "@/lib/places";
import type { OpeningStatus } from "@/lib/opening-hours";
import type { CityPlaceRecommendations } from "@/lib/recommendations";

export type RegionPlaceItem = {
  id: string;
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  photoUrl: string | null;
  note: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: PlacePriceLevel | null;
  phoneNumber: string | null;
  websiteUri: string | null;
  openingStatus: OpeningStatus | null;
};

function CategoryFilter({
  active,
  onChange,
  availableCategories,
}: {
  active: PlaceCategory | null;
  onChange: (category: PlaceCategory | null) => void;
  availableCategories: PlaceCategory[];
}) {
  if (availableCategories.length <= 1) return null;

  return (
    <div className="w-full flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`shrink-0 whitespace-nowrap h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
          active === null
            ? "border-primary bg-primary/10 text-primary"
            : "border-input hover:bg-accent"
        }`}
      >
        Alle
      </button>
      {PLACE_CATEGORIES.filter((category) => availableCategories.includes(category)).map(
        (category) => {
          const Icon = PLACE_CATEGORY_ICONS[category];
          const isActive = active === category;
          return (
            <button
              key={category}
              type="button"
              onClick={() => onChange(isActive ? null : category)}
              className={`shrink-0 inline-flex items-center gap-1 whitespace-nowrap h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
                isActive
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input hover:bg-accent"
              }`}
            >
              <Icon className="size-3" />
              {PLACE_CATEGORY_LABELS[category]}
            </button>
          );
        },
      )}
    </div>
  );
}

function AddPlaceRow() {
  return (
    <Link
      href="/orte"
      className="flex items-center justify-center gap-2 h-14 w-full rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
    >
      <Plus className="size-5" />
      <span className="text-sm font-medium">Ort hinzufügen</span>
    </Link>
  );
}

/**
 * Compact suggestion strip under the owner's own Orte-region list -- exact
 * same query (lib/recommendations.ts) as the Inspiration Orte tab's per-city
 * feed: friends who added something here first, then generic popular
 * places. Rating happens right here via Ja/Nein/Merken, same as everywhere.
 */
function PlaceSuggestionsStrip({ userId, regionName }: { userId: string; regionName: string }) {
  const [recommendations, setRecommendations] = useState<CityPlaceRecommendations | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/city-places?city=${encodeURIComponent(regionName)}`);
      if (!response.ok || cancelled) return;
      const data: CityPlaceRecommendations = await response.json();
      if (!cancelled) setRecommendations(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [regionName]);

  const allSuggestions = recommendations
    ? [...recommendations.fromFriends.map((entry) => entry.place), ...recommendations.generic]
    : [];
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const visibleSuggestions = allSuggestions.filter((place) => !dismissedIds.has(place.placeId));

  const handleAdd = async (placeId: string) => {
    const place = allSuggestions.find((p) => p.placeId === placeId);
    if (!place) return;
    setPendingId(placeId);
    const supabase = createClient();
    const { error } = await savePlaceToRegion(supabase, userId, regionName, place);
    if (!error) setDismissedIds((prev) => new Set(prev).add(placeId));
    setPendingId(null);
  };

  const handleDislike = async (placeId: string) => {
    setDismissedIds((prev) => new Set(prev).add(placeId));
    const supabase = createClient();
    await setInteractionWithCredits(supabase, userId, { itemId: placeId, mediaType: "place" }, "dislike");
  };

  if (visibleSuggestions.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-3 mt-2 pt-4 border-t border-dashed">
      <h2 className="text-xs font-medium text-muted-foreground">
        Weitere Empfehlungen für {regionName}
      </h2>
      <div className="w-full flex flex-col gap-3">
        {visibleSuggestions.map((place) => (
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
            actions={{
              variant: "rate",
              pending: pendingId === place.placeId,
              onLike: () => handleAdd(place.placeId),
              onDislike: () => handleDislike(place.placeId),
              onAdd: () => handleAdd(place.placeId),
              addLabel: "Merken",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function OwnerRegionList({
  initialItems,
  userId,
  regionName,
}: {
  initialItems: RegionPlaceItem[];
  userId: string;
  regionName: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<PlaceCategory | null>(null);
  const [showNoteModalFor, setShowNoteModalFor] = useState<RegionPlaceItem | null>(null);
  const [showDetailsFor, setShowDetailsFor] = useState<RegionPlaceItem | null>(null);

  const handleRemove = async (item: RegionPlaceItem) => {
    setRemovingId(item.id);
    const supabase = createClient();
    const { error } = await removePlace(supabase, userId, item.placeId);
    if (!error) {
      setItems((prev) => prev.filter((existing) => existing.id !== item.id));
    }
    setRemovingId(null);
  };

  const handleSaveNote = async (item: RegionPlaceItem, note: string | null) => {
    const supabase = createClient();
    const { error } = await updatePlaceNote(supabase, userId, item.placeId, note);
    if (!error) {
      setItems((prev) => prev.map((existing) => (existing.id === item.id ? { ...existing, note } : existing)));
    }
  };

  const availableCategories = [...new Set(items.map((item) => item.category))];
  const visibleItems = activeCategory
    ? items.filter((item) => item.category === activeCategory)
    : items;

  return (
    <div className="w-full flex flex-col gap-3">
      <CategoryFilter
        active={activeCategory}
        onChange={setActiveCategory}
        availableCategories={availableCategories}
      />

      {items.length === 0 && (
        <p className="w-full text-sm text-muted-foreground">
          Diese Liste enthält noch keine Orte.
        </p>
      )}

      {visibleItems.map((item) => (
        <PlaceItemRow
          key={item.id}
          imageUrl={item.photoUrl}
          name={item.name}
          category={item.category}
          address={item.address}
          rating={item.rating}
          userRatingCount={item.userRatingCount}
          openingStatus={item.openingStatus}
          priceLevel={item.priceLevel}
          phoneNumber={item.phoneNumber}
          websiteUri={item.websiteUri}
          note={item.note}
          onOpenDetails={() => setShowDetailsFor(item)}
          actions={{
            variant: "owned",
            onEditNote: () => setShowNoteModalFor(item),
            onRemove: () => handleRemove(item),
            isRemoving: removingId === item.id,
          }}
        />
      ))}
      {!activeCategory && <AddPlaceRow />}
      {!activeCategory && <PlaceSuggestionsStrip userId={userId} regionName={regionName} />}

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
          note={showDetailsFor.note}
          onClose={() => setShowDetailsFor(null)}
        />
      )}

      {showNoteModalFor && (
        <NoteModal
          title={showNoteModalFor.name}
          posterUrl={showNoteModalFor.photoUrl}
          initialNote={showNoteModalFor.note}
          placeholder="Was macht diesen Ort besonders?"
          onSave={(note) => handleSaveNote(showNoteModalFor, note)}
          onClose={() => setShowNoteModalFor(null)}
        />
      )}
    </div>
  );
}

function VisitorRegionList({
  initialItems,
  ownerId,
}: {
  initialItems: RegionPlaceItem[];
  ownerId: string;
}) {
  const items = initialItems;
  const [user, setUser] = useState<User | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [pendingPlaceId, setPendingPlaceId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<PlaceCategory | null>(null);
  const [likedKeys, setLikedKeys] = useState<Set<string>>(new Set());
  const [notePrompt, setNotePrompt] = useState<RegionPlaceItem | null>(null);
  const [showDetailsFor, setShowDetailsFor] = useState<RegionPlaceItem | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);
      if (!currentUser) return;
      const { data } = await supabase
        .from("item_interactions")
        .select("item_id")
        .eq("user_id", currentUser.id)
        .eq("interaction_type", "like")
        .eq("media_type", "place");
      setLikedKeys(new Set((data ?? []).map((row) => row.item_id)));
    })();
  }, []);

  const handleToggleLike = async (item: RegionPlaceItem) => {
    if (!user) return;
    const supabase = createClient();
    const isLiked = likedKeys.has(item.placeId);
    if (isLiked) {
      await removeInteractionWithCredits(supabase, user.id, { itemId: item.placeId, mediaType: "place" });
      setLikedKeys((prev) => {
        const next = new Set(prev);
        next.delete(item.placeId);
        return next;
      });
    } else {
      await setInteractionWithCredits(
        supabase,
        user.id,
        { itemId: item.placeId, mediaType: "place" },
        "like",
        [ownerId],
      );
      setLikedKeys((prev) => new Set(prev).add(item.placeId));
    }
  };

  const handleAdd = async (item: RegionPlaceItem) => {
    if (!user || pendingPlaceId) return;
    setPendingPlaceId(item.placeId);
    const supabase = createClient();

    try {
      const geoResponse = await fetch(`/api/reverse-geocode?lat=${item.lat}&lng=${item.lng}`);
      const geoData: { region: string | null } = await geoResponse.json();
      const region = geoData.region ?? "Sonstige Orte";

      const { error } = await savePlaceToRegion(supabase, user.id, region, {
        placeId: item.placeId,
        name: item.name,
        address: item.address,
        lat: item.lat,
        lng: item.lng,
        category: item.category,
        photoUrl: item.photoUrl,
        googleMapsUri: item.googleMapsUri,
        rating: item.rating,
        userRatingCount: item.userRatingCount,
        priceLevel: item.priceLevel,
        phoneNumber: item.phoneNumber,
        websiteUri: item.websiteUri,
      });

      if (!error) {
        showToast(`Zu „${region}“ hinzugefügt`);
        setNotePrompt(item);
      }
    } finally {
      setPendingPlaceId(null);
    }
  };

  const availableCategories = [...new Set(items.map((item) => item.category))];
  const visibleItems = activeCategory
    ? items.filter((item) => item.category === activeCategory)
    : items;

  if (items.length === 0) {
    return (
      <p className="w-full text-sm text-muted-foreground">
        Diese Liste enthält noch keine Orte.
      </p>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3">
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
            {toastMessage}
          </div>
        </div>
      )}
      <CategoryFilter
        active={activeCategory}
        onChange={setActiveCategory}
        availableCategories={availableCategories}
      />
      {visibleItems.map((item) => (
        <PlaceItemRowForOwner key={item.id} item={item} />
      ))}

      {showGuestPrompt && (
        <GuestSignupModal
          message="Melde dich an, um Orte zu deinen eigenen Listen hinzuzufügen."
          next="/orte"
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
          note={showDetailsFor.note}
          onClose={() => setShowDetailsFor(null)}
        />
      )}

      {notePrompt && user && (
        <NoteModal
          title={notePrompt.name}
          posterUrl={notePrompt.photoUrl}
          initialNote={null}
          placeholder="Was macht diesen Ort besonders?"
          onSave={async (note) => {
            const supabase = createClient();
            await updatePlaceNote(supabase, user.id, notePrompt.placeId, note);
          }}
          onClose={() => setNotePrompt(null)}
        />
      )}
    </div>
  );

  function PlaceItemRowForOwner({ item }: { item: RegionPlaceItem }) {
    return (
      <PlaceItemRow
        imageUrl={item.photoUrl}
        name={item.name}
        category={item.category}
        address={item.address}
        rating={item.rating}
        userRatingCount={item.userRatingCount}
        openingStatus={item.openingStatus}
        priceLevel={item.priceLevel}
        phoneNumber={item.phoneNumber}
        websiteUri={item.websiteUri}
        onOpenDetails={() => setShowDetailsFor(item)}
        isLoggedIn={!!user}
        onGuestClick={() => setShowGuestPrompt(true)}
        actions={{
          variant: "foreign",
          isLiked: likedKeys.has(item.placeId),
          onToggleLike: () => handleToggleLike(item),
          onAdd: () => handleAdd(item),
          addLabel: "Hinzufügen",
        }}
      />
    );
  }
}

export function RegionItemsGrid({
  username,
  regionKey,
  regionName,
  ownerId,
  currentUserId,
}: {
  username: string;
  regionKey: string;
  regionName: string;
  ownerId: string;
  currentUserId?: string | null;
}) {
  const [items, setItems] = useState<RegionPlaceItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    (async () => {
      const response = await fetch(
        `/api/place-items?username=${encodeURIComponent(username)}&region=${encodeURIComponent(regionKey)}`,
      );
      if (!response.ok || cancelled) return;
      const data: { items: RegionPlaceItem[] } = await response.json();
      if (!cancelled) setItems(data.items);
    })();
    return () => {
      cancelled = true;
    };
  }, [username, regionKey]);

  if (items === null) {
    return <p className="text-sm text-muted-foreground">Lädt…</p>;
  }

  const isOwner = currentUserId === ownerId;

  return isOwner ? (
    <OwnerRegionList initialItems={items} userId={ownerId} regionName={regionName} />
  ) : (
    <VisitorRegionList initialItems={items} ownerId={ownerId} />
  );
}
