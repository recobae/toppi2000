"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { List as ListIcon, Lightbulb, Map as MapIcon, Pencil, Plus } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { NoteModal } from "@/components/lists/note-modal";
import { PlaceDetailModal } from "@/components/orte/place-detail-modal";
import { PlaceMapView } from "@/components/orte/place-map-view";
import { PlaceItemRow } from "@/components/items/list-item-row";
import {
  removePlace,
  savePlaceToRegion,
  updatePlaceNote,
  updateRegionNote,
  type PlaceStatus,
} from "@/lib/place-items";
import { setInteractionWithCredits, recordInspiredCredits } from "@/lib/interaction-credits";
import { recordDislike } from "@/lib/rating";
import { useOwnInteractions, type OwnInteractionEntry } from "@/lib/hooks/use-own-interactions";
import { REGION_NOTE_MAX_LENGTH } from "@/lib/notes";
import {
  PLACE_CATEGORIES,
  PLACE_CATEGORY_ICONS,
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
  type PlacePriceLevel,
} from "@/lib/places";
import type { OpeningStatus } from "@/lib/opening-hours";
import type { CityPlaceRecommendations } from "@/lib/recommendations";
import type { PlaceSearchResult } from "@/lib/google-places";

export type ViewMode = "list" | "map";

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
  status: PlaceStatus;
};

const SAVED_DIVIDER_LABEL = "Möchte ich noch besuchen";

function CategoryFilter({
  active,
  onChange,
  availableCategories,
  showSavedFilter,
  savedActive,
  onToggleSaved,
}: {
  active: PlaceCategory | null;
  onChange: (category: PlaceCategory | null) => void;
  availableCategories: PlaceCategory[];
  showSavedFilter?: boolean;
  savedActive?: boolean;
  onToggleSaved?: () => void;
}) {
  if (availableCategories.length <= 1 && !showSavedFilter) return null;

  return (
    <div className="w-full flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`shrink-0 whitespace-nowrap h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
          active === null && !savedActive
            ? "border-primary bg-primary/10 text-primary"
            : "border-input hover:bg-accent"
        }`}
      >
        Alle Empfehlungen
      </button>
      {PLACE_CATEGORIES.filter((category) => availableCategories.includes(category)).map(
        (category) => {
          const Icon = PLACE_CATEGORY_ICONS[category];
          const isActive = active === category && !savedActive;
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
      {showSavedFilter && (
        <button
          type="button"
          onClick={onToggleSaved}
          className={`shrink-0 whitespace-nowrap h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
            savedActive
              ? "border-primary bg-primary/10 text-primary"
              : "border-input hover:bg-accent"
          }`}
        >
          Gemerkt
        </button>
      )}
    </div>
  );
}

/** Listenansicht/Karten-Umschalter -- lebt jetzt im kompakten Seiten-Header (RegionPageShell), nicht mehr neben den Kategorie-Chips. */
export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="shrink-0 flex items-center rounded-full border border-input p-0.5">
      <button
        type="button"
        aria-label="Listenansicht"
        aria-pressed={mode === "list"}
        onClick={() => onChange("list")}
        className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
          mode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
        }`}
      >
        <ListIcon className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Kartenansicht"
        aria-pressed={mode === "map"}
        onClick={() => onChange("map")}
        className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
          mode === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
        }`}
      >
        <MapIcon className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * The one general tips/hacks note for the whole region list (Roller-Verleih,
 * beste Kreditkarte fürs Ausland, ...) -- distinct from a per-place note.
 * Rendered as the topmost row, same card shape as the place rows below it,
 * so it reads as "part of this list" rather than a separate callout box.
 * Visitors never see an empty state; owners always get an edit affordance.
 */
function RegionNoteRow({
  note,
  isOwner,
  onEdit,
}: {
  note: string | null;
  isOwner: boolean;
  onEdit?: () => void;
}) {
  if (!note && !isOwner) return null;

  return (
    <Card className="overflow-hidden flex gap-3 p-3">
      <div className="relative w-16 aspect-[4/3] shrink-0 rounded-md overflow-hidden bg-amber-500/10 flex items-center justify-center">
        <Lightbulb className="size-5 fill-current text-amber-500" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1 justify-center">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Allgemeine Tipps
        </p>
        {note ? (
          <p className="text-sm leading-snug whitespace-pre-wrap">{note}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">Noch keine Tipps hinterlegt.</p>
        )}
      </div>
      {isOwner && onEdit && (
        <Button
          variant="outline"
          size="sm"
          className="self-center shrink-0"
          aria-label="Tipps bearbeiten"
          onClick={onEdit}
        >
          <Pencil />
        </Button>
      )}
    </Card>
  );
}

function AddPlaceRow() {
  return (
    <Link
      href="/hinzufuegen?tab=orte"
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
 * places. Rating happens right here via Gefällt mir/Nix für mich/Merken, and clicking
 * an item opens the same detail modal, exactly like the Inspiration feed.
 */
function PlaceSuggestionsStrip({ userId, regionName }: { userId: string; regionName: string }) {
  const [recommendations, setRecommendations] = useState<CityPlaceRecommendations | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [exhausted, setExhausted] = useState(false);
  const [showDetailsFor, setShowDetailsFor] = useState<PlaceSearchResult | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const limitRef = useRef(12);
  const isReloadingRef = useRef(false);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  const unDismiss = (placeId: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(placeId);
      return next;
    });
  };

  const load = useCallback(async (limit: number) => {
    const response = await fetch(
      `/api/city-places?city=${encodeURIComponent(regionName)}&limit=${limit}`,
    );
    if (!response.ok) return null;
    const data: CityPlaceRecommendations = await response.json();
    setRecommendations(data);
    return data;
  }, [regionName]);

  useEffect(() => {
    limitRef.current = 12;
    setExhausted(false);
    setDismissedIds(new Set());
    load(limitRef.current);
  }, [load]);

  const allSuggestions = recommendations
    ? [...recommendations.fromFriends.map((entry) => entry.place), ...recommendations.generic]
    : [];
  const visibleSuggestions = allSuggestions.filter((place) => !dismissedIds.has(place.placeId));

  // Every visible suggestion rated -> automatically fetch a bigger batch
  // instead of leaving the strip empty; a reload that's still empty is a
  // genuine dead end and the strip just hides.
  useEffect(() => {
    if (!recommendations || visibleSuggestions.length > 0 || exhausted || isReloadingRef.current) {
      return;
    }
    isReloadingRef.current = true;
    const nextLimit = limitRef.current + 24;
    load(nextLimit).then((data) => {
      limitRef.current = nextLimit;
      setDismissedIds(new Set());
      const stillEmpty = !data || data.fromFriends.length + data.generic.length === 0;
      if (stillEmpty) setExhausted(true);
      isReloadingRef.current = false;
    });
  }, [recommendations, visibleSuggestions.length, exhausted, load]);

  const handleAdd = async (placeId: string, status: PlaceStatus) => {
    const place = allSuggestions.find((p) => p.placeId === placeId);
    if (!place) return;
    setPendingId(placeId);
    const supabase = createClient();
    const { error } = await savePlaceToRegion(supabase, userId, regionName, place, undefined, status);
    if (!error) setDismissedIds((prev) => new Set(prev).add(placeId));
    setPendingId(null);
  };

  const handleDislike = async (placeId: string) => {
    setDismissedIds((prev) => new Set(prev).add(placeId));
    const supabase = createClient();
    const { error } = await recordDislike(supabase, userId, { itemId: placeId, mediaType: "place" });
    if (error) {
      unDismiss(placeId);
      showToast("Konnte nicht gespeichert werden, versuch's nochmal");
    }
  };

  if (visibleSuggestions.length === 0 && !toastMessage) return null;

  return (
    <>
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
            {toastMessage}
          </div>
        </div>
      )}
      {visibleSuggestions.length > 0 && (
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
                onOpenDetails={() => setShowDetailsFor(place)}
                actions={{
                  variant: "rate",
                  pending: pendingId === place.placeId,
                  onLike: () => handleAdd(place.placeId, "recommended"),
                  onDislike: () => handleDislike(place.placeId),
                  onAdd: () => handleAdd(place.placeId, "want_to_visit"),
                  addLabel: "Merken",
                }}
              />
            ))}
          </div>

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
        </div>
      )}
    </>
  );
}

function OwnerRegionList({
  initialItems,
  userId,
  regionId,
  regionName,
  initialGeneralNote,
  viewMode,
}: {
  initialItems: RegionPlaceItem[];
  userId: string;
  regionId: string;
  regionName: string;
  initialGeneralNote: string | null;
  /** Owned by RegionPageShell (the page header), not this component -- the toggle itself now lives in the compact header row. */
  viewMode: ViewMode;
}) {
  const [items, setItems] = useState(initialItems);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<PlaceCategory | null>(null);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [showNoteModalFor, setShowNoteModalFor] = useState<RegionPlaceItem | null>(null);
  const [showDetailsFor, setShowDetailsFor] = useState<RegionPlaceItem | null>(null);
  const [generalNote, setGeneralNote] = useState(initialGeneralNote);
  const [showRegionNoteModal, setShowRegionNoteModal] = useState(false);

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

  const handleSaveRegionNote = async (note: string | null) => {
    const supabase = createClient();
    const { error } = await updateRegionNote(supabase, userId, regionId, note);
    if (!error) setGeneralNote(note);
  };

  const availableCategories = [...new Set(items.map((item) => item.category))];
  const categoryFiltered = activeCategory
    ? items.filter((item) => item.category === activeCategory)
    : items;
  const recommendedItems = categoryFiltered.filter((item) => item.status !== "want_to_visit");
  const savedItems = categoryFiltered.filter((item) => item.status === "want_to_visit");

  const renderRow = (item: RegionPlaceItem) => (
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
  );

  const mapSourceItems = showSavedOnly ? savedItems : categoryFiltered;

  return (
    <div className="w-full flex flex-col gap-3">
      <CategoryFilter
        active={activeCategory}
        onChange={setActiveCategory}
        availableCategories={availableCategories}
        showSavedFilter={items.some((item) => item.status === "want_to_visit")}
        savedActive={showSavedOnly}
        onToggleSaved={() => setShowSavedOnly((prev) => !prev)}
      />

      <RegionNoteRow
        note={generalNote}
        isOwner
        onEdit={() => setShowRegionNoteModal(true)}
      />

      {items.length === 0 && (
        <p className="w-full text-sm text-muted-foreground">
          Diese Liste enthält noch keine Orte.
        </p>
      )}

      {viewMode === "map" ? (
        <PlaceMapView
          places={mapSourceItems.map((item) => ({ id: item.id, lat: item.lat, lng: item.lng, name: item.name }))}
          onSelectPlace={(id) => {
            const item = mapSourceItems.find((entry) => entry.id === id);
            if (item) setShowDetailsFor(item);
          }}
        />
      ) : showSavedOnly ? (
        savedItems.map(renderRow)
      ) : (
        <>
          {recommendedItems.map(renderRow)}

          {recommendedItems.length > 0 && savedItems.length > 0 && (
            <div className="w-full flex items-center gap-2 pt-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                {SAVED_DIVIDER_LABEL}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          {savedItems.map(renderRow)}
        </>
      )}

      {viewMode === "list" && !showSavedOnly && !activeCategory && <AddPlaceRow />}
      {viewMode === "list" && !showSavedOnly && !activeCategory && (
        <PlaceSuggestionsStrip userId={userId} regionName={regionName} />
      )}

      {showRegionNoteModal && (
        <NoteModal
          title={`Tipps für ${regionName}`}
          posterUrl={null}
          initialNote={generalNote}
          placeholder="z. B. wo man am besten einen Roller leiht, beste Kreditkarte fürs Ausland …"
          label="Allgemeine Tipps zu dieser Liste (optional)"
          maxLength={REGION_NOTE_MAX_LENGTH}
          onSave={handleSaveRegionNote}
          onClose={() => setShowRegionNoteModal(false)}
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
  generalNote,
  viewMode,
  initialOwnInteractions,
}: {
  initialItems: RegionPlaceItem[];
  ownerId: string;
  generalNote: string | null;
  /** Owned by RegionPageShell (the page header), not this component. */
  viewMode: ViewMode;
  initialOwnInteractions?: OwnInteractionEntry[];
}) {
  const items = initialItems;
  const [user, setUser] = useState<User | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);
  const [pendingPlaceId, setPendingPlaceId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<PlaceCategory | null>(null);
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [notePrompt, setNotePrompt] = useState<RegionPlaceItem | null>(null);
  const [showDetailsFor, setShowDetailsFor] = useState<RegionPlaceItem | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  const { getOwn, markOwn } = useOwnInteractions(
    items.map((item) => ({ id: item.placeId, mediaType: "place" as const })),
    initialOwnInteractions,
  );

  // Rating a place on someone else's list behaves exactly like rating an
  // unrated Orte feed item -- Ja/Nein/Merken -- except the write target and
  // credited owner are this list's owner instead of nobody. Ja and Merken
  // both resolve the viewer's own region via reverse-geocoding, same as the
  // Inspiration Orte tab; only the status (and whether a like credit is
  // recorded) differs.
  const handleSave = async (item: RegionPlaceItem, status: PlaceStatus) => {
    if (!user || pendingPlaceId) return;
    setPendingPlaceId(item.placeId);
    const supabase = createClient();

    try {
      if (status === "recommended") {
        await setInteractionWithCredits(
          supabase,
          user.id,
          { itemId: item.placeId, mediaType: "place" },
          "like",
          [ownerId],
        );
        markOwn(item.placeId, "place", "like");
      }

      const geoResponse = await fetch(`/api/reverse-geocode?lat=${item.lat}&lng=${item.lng}`);
      const geoData: { region: string | null } = await geoResponse.json();
      const region = geoData.region ?? "Sonstige Orte";

      const { error } = await savePlaceToRegion(
        supabase,
        user.id,
        region,
        {
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
        },
        ownerId,
        status,
      );

      if (!error) {
        await recordInspiredCredits(supabase, user.id, [ownerId], {
          itemId: item.placeId,
          mediaType: "place",
        });
        showToast(`Zu „${region}“ hinzugefügt`);
        setNotePrompt(item);
      }
    } finally {
      setPendingPlaceId(null);
    }
  };

  const handleDislike = async (item: RegionPlaceItem) => {
    if (!user) return;
    const supabase = createClient();
    const { error } = await recordDislike(supabase, user.id, { itemId: item.placeId, mediaType: "place" });
    if (error) {
      showToast("Konnte nicht gespeichert werden, versuch's nochmal");
    } else {
      markOwn(item.placeId, "place", "dislike");
    }
  };

  const availableCategories = [...new Set(items.map((item) => item.category))];
  const categoryFiltered = activeCategory
    ? items.filter((item) => item.category === activeCategory)
    : items;
  const recommendedItems = categoryFiltered.filter((item) => item.status !== "want_to_visit");
  const savedItems = categoryFiltered.filter((item) => item.status === "want_to_visit");

  const mapSourceItems = showSavedOnly ? savedItems : categoryFiltered;

  if (items.length === 0 && !generalNote) {
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
        showSavedFilter={items.some((item) => item.status === "want_to_visit")}
        savedActive={showSavedOnly}
        onToggleSaved={() => setShowSavedOnly((prev) => !prev)}
      />

      <RegionNoteRow note={generalNote} isOwner={false} />

      {items.length === 0 && (
        <p className="w-full text-sm text-muted-foreground">
          Diese Liste enthält noch keine Orte.
        </p>
      )}

      {viewMode === "map" ? (
        <PlaceMapView
          places={mapSourceItems.map((item) => ({ id: item.id, lat: item.lat, lng: item.lng, name: item.name }))}
          onSelectPlace={(id) => {
            const item = mapSourceItems.find((entry) => entry.id === id);
            if (item) setShowDetailsFor(item);
          }}
        />
      ) : showSavedOnly ? (
        savedItems.map((item) => <PlaceItemRowForOwner key={item.id} item={item} />)
      ) : (
        <>
          {recommendedItems.map((item) => (
            <PlaceItemRowForOwner key={item.id} item={item} />
          ))}

          {recommendedItems.length > 0 && savedItems.length > 0 && (
            <div className="w-full flex items-center gap-2 pt-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                {SAVED_DIVIDER_LABEL}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}

          {savedItems.map((item) => (
            <PlaceItemRowForOwner key={item.id} item={item} />
          ))}
        </>
      )}

      {showGuestPrompt && (
        <GuestSignupModal
          message="Melde dich an, um Orte zu deinen eigenen Listen hinzuzufügen."
          next="/hinzufuegen?tab=orte"
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
        note={item.note}
        onOpenDetails={() => setShowDetailsFor(item)}
        isLoggedIn={!!user}
        onGuestClick={() => setShowGuestPrompt(true)}
        actions={{
          variant: "rate",
          pending: pendingPlaceId === item.placeId,
          ownInteraction: getOwn(item.placeId, "place"),
          onLike: () => handleSave(item, "recommended"),
          onDislike: () => handleDislike(item),
          onAdd: () => handleSave(item, "want_to_visit"),
          addLabel: "Merken",
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
  initialOwnInteractions,
  viewMode,
}: {
  username: string;
  regionKey: string;
  regionName: string;
  ownerId: string;
  currentUserId?: string | null;
  initialOwnInteractions?: OwnInteractionEntry[];
  /** Owned by RegionPageShell (the page header), forwarded down to whichever list renders. */
  viewMode: ViewMode;
}) {
  const [items, setItems] = useState<RegionPlaceItem[] | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [generalNote, setGeneralNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    (async () => {
      const response = await fetch(
        `/api/place-items?username=${encodeURIComponent(username)}&region=${encodeURIComponent(regionKey)}`,
      );
      if (!response.ok || cancelled) return;
      const data: { items: RegionPlaceItem[]; regionId: string; generalNote: string | null } =
        await response.json();
      if (!cancelled) {
        setItems(data.items);
        setRegionId(data.regionId);
        setGeneralNote(data.generalNote);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, regionKey]);

  if (items === null || regionId === null) {
    return <p className="text-sm text-muted-foreground">Lädt…</p>;
  }

  const isOwner = currentUserId === ownerId;

  return isOwner ? (
    <OwnerRegionList
      initialItems={items}
      userId={ownerId}
      regionId={regionId}
      regionName={regionName}
      initialGeneralNote={generalNote}
      viewMode={viewMode}
    />
  ) : (
    <VisitorRegionList
      initialItems={items}
      ownerId={ownerId}
      generalNote={generalNote}
      viewMode={viewMode}
      initialOwnInteractions={initialOwnInteractions}
    />
  );
}
