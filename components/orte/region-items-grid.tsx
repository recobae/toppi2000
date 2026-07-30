"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, Pencil, Plus, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { NoteModal } from "@/components/lists/note-modal";
import { PlaceDetailModal } from "@/components/orte/place-detail-modal";
import { PlaceResultCard } from "@/components/orte/place-result-card";
import { removePlace, savePlaceToRegion, updatePlaceNote } from "@/lib/place-items";
import { setInteractionWithCredits } from "@/lib/interaction-credits";
import { usePlaceSavedState } from "@/lib/hooks/use-place-saved-state";
import type { CityPlaceRecommendations } from "@/lib/recommendations";
import { PlaceDetailsRow } from "@/components/orte/place-details-row";
import {
  PLACE_CATEGORIES,
  PLACE_CATEGORY_ICONS,
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
  type PlacePriceLevel,
} from "@/lib/places";
import { truncateNote } from "@/lib/notes";
import type { OpeningStatus } from "@/lib/opening-hours";

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

type Toast = { id: number; message: string };

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg"
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

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

/** Row layout shared with movie/tv lists -- reference layout is the
 * friend-feed "Von deinen Freunden" cards. Thumbnail left, info + actions
 * right, no more poster-grid tiles. */
function OwnerPlaceRow({
  item,
  onRemove,
  isRemoving,
  onNoteSaved,
}: {
  item: RegionPlaceItem;
  onRemove: (item: RegionPlaceItem) => void;
  isRemoving: boolean;
  onNoteSaved: (item: RegionPlaceItem, note: string | null) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const Icon = PLACE_CATEGORY_ICONS[item.category];

  const handleSaveNote = async (note: string | null) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await updatePlaceNote(supabase, user.id, item.placeId, note);
    if (!error) onNoteSaved(item, note);
  };

  return (
    <>
      <Card className="overflow-hidden flex gap-3 p-3">
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          aria-label={`Details zu ${item.name} anzeigen`}
          className="relative w-16 aspect-[4/3] shrink-0 rounded-md overflow-hidden bg-muted"
        >
          {item.photoUrl ? (
            <Image src={item.photoUrl} alt={item.name} fill sizes="64px" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Icon className="size-5" />
            </div>
          )}
        </button>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p className="text-sm font-medium leading-tight line-clamp-2">{item.name}</p>
          <span className="inline-flex w-fit items-center gap-1 text-[10px] font-medium rounded bg-secondary text-secondary-foreground px-1.5 py-0.5">
            <Icon className="size-3" />
            {PLACE_CATEGORY_LABELS[item.category]}
          </span>
          <p className="text-[11px] text-muted-foreground line-clamp-1">{item.address}</p>
          <PlaceDetailsRow
            rating={item.rating}
            userRatingCount={item.userRatingCount}
            openingStatus={item.openingStatus}
            priceLevel={item.priceLevel}
            phoneNumber={item.phoneNumber}
            websiteUri={item.websiteUri}
          />
          {item.note && (
            <p className="text-[11px] italic text-muted-foreground line-clamp-2">
              „{truncateNote(item.note)}“
            </p>
          )}
          <div className="mt-auto pt-2 flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              aria-label={item.note ? "Notiz bearbeiten" : "Notiz hinzufügen"}
              onClick={() => setShowNoteModal(true)}
            >
              <Pencil />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={isRemoving}
              onClick={() => onRemove(item)}
            >
              <X />
              {isRemoving ? "Wird entfernt…" : "Entfernen"}
            </Button>
          </div>
        </div>
      </Card>

      {showDetails && (
        <PlaceDetailModal
          name={item.name}
          address={item.address}
          category={item.category}
          photoUrl={item.photoUrl}
          lat={item.lat}
          lng={item.lng}
          googleMapsUri={item.googleMapsUri}
          rating={item.rating}
          userRatingCount={item.userRatingCount}
          priceLevel={item.priceLevel}
          phoneNumber={item.phoneNumber}
          websiteUri={item.websiteUri}
          openingStatus={item.openingStatus}
          note={item.note}
          onClose={() => setShowDetails(false)}
        />
      )}

      {showNoteModal && (
        <NoteModal
          title={item.name}
          posterUrl={item.photoUrl}
          initialNote={item.note}
          placeholder="Was macht diesen Ort besonders?"
          onSave={handleSaveNote}
          onClose={() => setShowNoteModal(false)}
        />
      )}
    </>
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
 * places. Rating happens right here via Ja (hinzufügen)/Nein.
 */
function PlaceSuggestionsStrip({ userId, regionName }: { userId: string; regionName: string }) {
  const [recommendations, setRecommendations] = useState<CityPlaceRecommendations | null>(null);
  const { savedIds, markSaved } = usePlaceSavedState(userId);

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

  if (visibleSuggestions.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-3 mt-2 pt-4 border-t border-dashed">
      <h2 className="text-xs font-medium text-muted-foreground">
        Weitere Empfehlungen für {regionName}
      </h2>
      <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-3">
        {visibleSuggestions.map((place) => (
          <PlaceResultCard
            key={place.placeId}
            place={place}
            isLoggedIn
            isSaved={savedIds.has(place.placeId)}
            isSaving={false}
            onToggleSave={async () => {
              const supabase = createClient();
              const { error } = await savePlaceToRegion(supabase, userId, regionName, place);
              if (!error) markSaved(place.placeId, true);
            }}
            onDislike={async () => {
              setDismissedIds((prev) => new Set(prev).add(place.placeId));
              const supabase = createClient();
              await setInteractionWithCredits(
                supabase,
                userId,
                { itemId: place.placeId, mediaType: "place" },
                "dislike",
              );
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

  const handleRemove = async (item: RegionPlaceItem) => {
    setRemovingId(item.id);
    const supabase = createClient();
    const { error } = await removePlace(supabase, userId, item.placeId);
    if (!error) {
      setItems((prev) => prev.filter((existing) => existing.id !== item.id));
    }
    setRemovingId(null);
  };

  const handleNoteSaved = (item: RegionPlaceItem, note: string | null) => {
    setItems((prev) =>
      prev.map((existing) => (existing.id === item.id ? { ...existing, note } : existing)),
    );
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
        <OwnerPlaceRow
          key={item.id}
          item={item}
          onRemove={handleRemove}
          isRemoving={removingId === item.id}
          onNoteSaved={handleNoteSaved}
        />
      ))}
      {!activeCategory && <AddPlaceRow />}
      {!activeCategory && <PlaceSuggestionsStrip userId={userId} regionName={regionName} />}
    </div>
  );
}

function VisitorPlaceRow({
  item,
  isLoggedIn,
  isSaved,
  isSaving,
  onToggleSave,
  onGuestClick,
}: {
  item: RegionPlaceItem;
  isLoggedIn: boolean;
  isSaved: boolean;
  isSaving: boolean;
  onToggleSave: () => void;
  onGuestClick: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const Icon = PLACE_CATEGORY_ICONS[item.category];

  const handleSaveClick = () => {
    if (!isLoggedIn) {
      onGuestClick();
      return;
    }
    onToggleSave();
  };

  return (
    <>
      <Card className="overflow-hidden flex gap-3 p-3">
        <button
          type="button"
          onClick={() => setShowDetails(true)}
          aria-label={`Details zu ${item.name} anzeigen`}
          className="relative w-16 aspect-[4/3] shrink-0 rounded-md overflow-hidden bg-muted"
        >
          {item.photoUrl ? (
            <Image src={item.photoUrl} alt={item.name} fill sizes="64px" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Icon className="size-5" />
            </div>
          )}
        </button>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p className="text-sm font-medium leading-tight line-clamp-2">{item.name}</p>
          <span className="inline-flex w-fit items-center gap-1 text-[10px] font-medium rounded bg-secondary text-secondary-foreground px-1.5 py-0.5">
            <Icon className="size-3" />
            {PLACE_CATEGORY_LABELS[item.category]}
          </span>
          <p className="text-[11px] text-muted-foreground line-clamp-1">{item.address}</p>
          <PlaceDetailsRow
            rating={item.rating}
            userRatingCount={item.userRatingCount}
            openingStatus={item.openingStatus}
            priceLevel={item.priceLevel}
            phoneNumber={item.phoneNumber}
            websiteUri={item.websiteUri}
          />
          {item.note && (
            <p className="text-[11px] italic text-muted-foreground line-clamp-2">
              „{truncateNote(item.note)}“
            </p>
          )}
          <div className="mt-auto pt-2">
            <Button
              variant={isSaved ? "outline" : "default"}
              size="sm"
              disabled={isSaving}
              onClick={handleSaveClick}
            >
              {isSaved ? <Check /> : <Plus />}
              {isSaved ? "Gespeichert" : "Hinzufügen"}
            </Button>
          </div>
        </div>
      </Card>

      {showDetails && (
        <PlaceDetailModal
          name={item.name}
          address={item.address}
          category={item.category}
          photoUrl={item.photoUrl}
          lat={item.lat}
          lng={item.lng}
          googleMapsUri={item.googleMapsUri}
          rating={item.rating}
          userRatingCount={item.userRatingCount}
          priceLevel={item.priceLevel}
          phoneNumber={item.phoneNumber}
          websiteUri={item.websiteUri}
          openingStatus={item.openingStatus}
          note={item.note}
          onClose={() => setShowDetails(false)}
        />
      )}
    </>
  );
}

function VisitorRegionList({ initialItems }: { initialItems: RegionPlaceItem[] }) {
  const items = initialItems;
  const [user, setUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [pendingPlaceId, setPendingPlaceId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<PlaceCategory | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);
    })();
  }, []);

  const { savedIds, markSaved } = usePlaceSavedState(user?.id);

  const showToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const handleToggleSave = async (item: RegionPlaceItem) => {
    if (!user || pendingPlaceId) return;
    setPendingPlaceId(item.placeId);
    const supabase = createClient();

    try {
      if (savedIds.has(item.placeId)) {
        const { error } = await removePlace(supabase, user.id, item.placeId);
        if (!error) {
          markSaved(item.placeId, false);
          showToast("Entfernt");
        }
        return;
      }

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
        markSaved(item.placeId, true);
        showToast(`Zu „${region}“ hinzugefügt`);
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
      <ToastStack toasts={toasts} />
      <CategoryFilter
        active={activeCategory}
        onChange={setActiveCategory}
        availableCategories={availableCategories}
      />
      {visibleItems.map((item) => (
        <VisitorPlaceRow
          key={item.id}
          item={item}
          isLoggedIn={!!user}
          isSaved={savedIds.has(item.placeId)}
          isSaving={pendingPlaceId === item.placeId}
          onToggleSave={() => handleToggleSave(item)}
          onGuestClick={() => setShowGuestPrompt(true)}
        />
      ))}

      {showGuestPrompt && (
        <GuestSignupModal
          message="Melde dich an, um Orte zu deinen eigenen Listen hinzuzufügen."
          next="/orte"
          onClose={() => setShowGuestPrompt(false)}
        />
      )}
    </div>
  );
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
    <VisitorRegionList initialItems={items} />
  );
}
