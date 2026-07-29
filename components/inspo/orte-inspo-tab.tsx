"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { FriendFeedPlaceCard, type FriendFeedPlaceItem } from "@/components/inspo/friend-feed-place-card";
import { GuestSignupModal } from "@/components/guest-signup-modal";
import { setInteractionWithCredits, recordInspiredCredits } from "@/lib/interaction-credits";
import { savePlaceToRegion } from "@/lib/place-items";

const GUEST_SAVE_MESSAGE = "Melde dich an, um Orte zu deinen eigenen Listen hinzuzufügen.";

export function OrteInspoTab({
  user,
  showToast,
}: {
  user: User | null;
  showToast: (message: string) => void;
}) {
  const [feedItems, setFeedItems] = useState<FriendFeedPlaceItem[] | null>(null);
  const [guestModalMessage, setGuestModalMessage] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    const response = await fetch("/api/friend-feed?type=places");
    if (!response.ok) return;
    const data: { items: FriendFeedPlaceItem[] } = await response.json();
    setFeedItems(data.items);
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const removeFeedItem = (placeId: string) => {
    setFeedItems((prev) => (prev ?? []).filter((item) => item.placeId !== placeId));
  };

  const handleInteraction = async (item: FriendFeedPlaceItem, type: "like" | "dislike" | "skip") => {
    if (!user) return;
    removeFeedItem(item.placeId);
    const supabase = createClient();
    const ownerUserIds = item.recommended.userIds;
    await setInteractionWithCredits(
      supabase,
      user.id,
      { itemId: item.placeId, mediaType: "place" },
      type,
      ownerUserIds,
    );
    if (type === "like") showToast("Gefällt mir gemerkt");
    if (type === "dislike") showToast("Nicht dein Geschmack? Notiert.");
  };

  const handleAdd = async (item: FriendFeedPlaceItem) => {
    if (!user) return;
    removeFeedItem(item.placeId);
    const supabase = createClient();
    const ownerUserIds = item.recommended.userIds;
    const { error, regionName } = await savePlaceToRegion(
      supabase,
      user.id,
      item.regionName,
      {
        placeId: item.placeId,
        name: item.name,
        address: item.address,
        lat: item.lat,
        lng: item.lng,
        category: item.category,
        photoUrl: item.photoUrl,
      },
      ownerUserIds[0] ?? null,
    );
    if (error) {
      showToast("Hinzufügen fehlgeschlagen");
      return;
    }
    await recordInspiredCredits(supabase, user.id, ownerUserIds, {
      itemId: item.placeId,
      mediaType: "place",
    });
    showToast(`Zu „${regionName}“ hinzugefügt`);
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {feedItems === null ? (
        <p className="text-sm text-muted-foreground text-center pt-10">Lädt…</p>
      ) : feedItems.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center pt-10">
          Noch keine Orte-Empfehlungen von deinen Freunden.
        </p>
      ) : (
        <div className="w-full flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Von deinen Freunden</h2>
          <div className="w-full flex flex-col gap-3">
            {feedItems.map((item) => (
              <FriendFeedPlaceCard
                key={item.placeId}
                item={item}
                isLoggedIn={!!user}
                onInteraction={(type) => handleInteraction(item, type)}
                onAdd={() => handleAdd(item)}
                onGuestClick={() => setGuestModalMessage(GUEST_SAVE_MESSAGE)}
              />
            ))}
          </div>
        </div>
      )}

      {guestModalMessage && (
        <GuestSignupModal
          message={guestModalMessage}
          next="/inspo"
          onClose={() => setGuestModalMessage(null)}
        />
      )}
    </div>
  );
}
