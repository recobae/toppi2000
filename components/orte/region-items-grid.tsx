"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { GripVertical, Pencil, Plus, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { NoteModal } from "@/components/lists/note-modal";
import { PlaceDetailModal } from "@/components/orte/place-detail-modal";
import { PlaceResultCard } from "@/components/orte/place-result-card";
import { removePlace, savePlaceToRegion, updatePlaceNote } from "@/lib/place-items";
import { usePlaceSavedState } from "@/lib/hooks/use-place-saved-state";
import {
  PLACE_CATEGORIES,
  PLACE_CATEGORY_ICONS,
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
} from "@/lib/places";
import { truncateNote } from "@/lib/notes";

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

function OwnerPlaceCard({
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
  const sortable = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
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
    <div
      ref={sortable.setNodeRef}
      style={style}
      className={sortable.isDragging ? "opacity-40" : ""}
    >
      <Card className="overflow-hidden flex flex-col">
        <div className="relative aspect-[4/3] w-full bg-muted">
          <button
            type="button"
            aria-label="Ziehen zum Sortieren"
            className="absolute top-2 left-2 z-10 flex h-11 w-11 items-center justify-center rounded-md bg-background/80 backdrop-blur touch-none cursor-grab active:cursor-grabbing"
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowDetails(true)}
            aria-label={`Details zu ${item.name} anzeigen`}
            className="absolute inset-0"
          >
            {item.photoUrl ? (
              <Image
                src={item.photoUrl}
                alt={item.name}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <Icon className="size-8" />
              </div>
            )}
          </button>
        </div>
        <CardContent className="p-3 flex-1 flex flex-col gap-1">
          <p className="text-sm font-medium leading-tight line-clamp-2">
            {item.name}
          </p>
          <span className="inline-flex w-fit items-center gap-1 text-[10px] font-medium rounded bg-secondary text-secondary-foreground px-1.5 py-0.5">
            <Icon className="size-3" />
            {PLACE_CATEGORY_LABELS[item.category]}
          </span>
          <p className="text-[11px] text-muted-foreground line-clamp-1">
            {item.address}
          </p>
          {item.note && (
            <p className="text-[11px] italic text-muted-foreground line-clamp-2">
              „{truncateNote(item.note)}“
            </p>
          )}
          <div className="mt-auto pt-2 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              disabled={isRemoving}
              onClick={() => onRemove(item)}
            >
              <X />
              {isRemoving ? "Wird entfernt…" : "Entfernen"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label={item.note ? "Notiz bearbeiten" : "Notiz hinzufügen"}
              onClick={() => setShowNoteModal(true)}
            >
              <Pencil />
            </Button>
          </div>
        </CardContent>
      </Card>

      {showDetails && (
        <PlaceDetailModal
          name={item.name}
          address={item.address}
          category={item.category}
          photoUrl={item.photoUrl}
          lat={item.lat}
          lng={item.lng}
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
    </div>
  );
}

function AddPlaceTile() {
  return (
    <Link
      href="/orte"
      className="flex flex-col items-center justify-center gap-2 aspect-[4/3] w-full rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
    >
      <Plus className="size-8" />
      <span className="text-xs font-medium">Ort hinzufügen</span>
    </Link>
  );
}

function OwnerRegionGrid({
  initialItems,
  userId,
}: {
  initialItems: RegionPlaceItem[];
  userId: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<PlaceCategory | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleRemove = async (item: RegionPlaceItem) => {
    setRemovingId(item.id);
    const supabase = createClient();
    const { error } = await removePlace(supabase, userId, item.placeId);
    if (!error) {
      setItems((prev) => prev.filter((existing) => existing.id !== item.id));
    }
    setRemovingId(null);
  };

  const persistOrder = async (reordered: RegionPlaceItem[]) => {
    const supabase = createClient();
    try {
      await Promise.all(
        reordered.map((item, index) =>
          supabase.from("places").update({ position: index }).eq("id", item.id),
        ),
      );
    } catch {
      // reorder failed to persist; local order stays as the optimistic result
    }
  };

  const handleNoteSaved = (item: RegionPlaceItem, note: string | null) => {
    setItems((prev) =>
      prev.map((existing) => (existing.id === item.id ? { ...existing, note } : existing)),
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setItems((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id);
      const newIndex = prev.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = arrayMove(prev, oldIndex, newIndex);
      persistOrder(reordered);
      return reordered;
    });
  };

  const availableCategories = [...new Set(items.map((item) => item.category))];
  const visibleItems = activeCategory
    ? items.filter((item) => item.category === activeCategory)
    : items;

  return (
    <div className="w-full flex flex-col gap-4">
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

      <DndContext
        id="region-items-dnd-context"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={visibleItems.map((item) => item.id)} strategy={rectSortingStrategy}>
          <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {visibleItems.map((item) => (
              <OwnerPlaceCard
                key={item.id}
                item={item}
                onRemove={handleRemove}
                isRemoving={removingId === item.id}
                onNoteSaved={handleNoteSaved}
              />
            ))}
            {!activeCategory && <AddPlaceTile />}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function VisitorRegionGrid({ initialItems }: { initialItems: RegionPlaceItem[] }) {
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

      const geoResponse = await fetch(
        `/api/reverse-geocode?lat=${item.lat}&lng=${item.lng}`,
      );
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
    <div className="w-full flex flex-col gap-4">
      <ToastStack toasts={toasts} />
      <CategoryFilter
        active={activeCategory}
        onChange={setActiveCategory}
        availableCategories={availableCategories}
      />
      <div className="w-full grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {visibleItems.map((item) => (
          <PlaceResultCard
            key={item.id}
            place={{
              placeId: item.placeId,
              name: item.name,
              address: item.address,
              lat: item.lat,
              lng: item.lng,
              category: item.category,
              photoUrl: item.photoUrl,
            }}
            isLoggedIn={!!user}
            isSaved={savedIds.has(item.placeId)}
            isSaving={pendingPlaceId === item.placeId}
            onToggleSave={() => handleToggleSave(item)}
            onGuestClick={() => setShowGuestPrompt(true)}
            note={item.note}
          />
        ))}
      </div>

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
  ownerId,
  currentUserId,
}: {
  username: string;
  regionKey: string;
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
    <OwnerRegionGrid initialItems={items} userId={ownerId} />
  ) : (
    <VisitorRegionGrid initialItems={items} />
  );
}
