import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { SAVED_CATEGORIES, type SavedCategory } from "@/lib/categories";

export type SavedState = {
  top_list: boolean;
  watchlist: boolean;
  dont_watch: boolean;
  likes: boolean;
};

const EMPTY_SAVED_STATE: SavedState = {
  top_list: false,
  watchlist: false,
  dont_watch: false,
  likes: false,
};

export type SavedStateItem = { id: number; mediaType: "movie" | "tv" };

function itemKey(id: number, mediaType: string) {
  return `${mediaType}-${id}`;
}

/**
 * For a batch of items, finds which of the current user's own 4 collections
 * (top_list/watchlist/dont_watch/likes) already contain each one -- used to
 * highlight the save buttons on a card. One batch of queries per call, not
 * one per card. Returns an all-false map for guests.
 */
export function useSavedState(items: SavedStateItem[]) {
  const [user, setUser] = useState<User | null>(null);
  const [stateMap, setStateMap] = useState<Record<string, SavedState>>({});
  const itemsKey = items.map((item) => itemKey(item.id, item.mediaType)).join(",");

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    setUser(currentUser);

    if (!currentUser || items.length === 0) {
      setStateMap({});
      return;
    }

    const itemIds = [...new Set(items.map((item) => item.id))];
    const nextMap: Record<string, SavedState> = {};

    await Promise.all(
      SAVED_CATEGORIES.concat(["likes" as SavedCategory]).map(
        async (category) => {
          const { data } = await supabase
            .from(category)
            .select("item_id, media_type")
            .eq("user_id", currentUser.id)
            .in("item_id", itemIds);

          for (const row of data ?? []) {
            const key = itemKey(row.item_id, row.media_type);
            if (!nextMap[key]) nextMap[key] = { ...EMPTY_SAVED_STATE };
            nextMap[key][category as keyof SavedState] = true;
          }
        },
      ),
    );

    setStateMap(nextMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const markSaved = useCallback(
    (id: number, mediaType: string, category: keyof SavedState, value: boolean) => {
      const key = itemKey(id, mediaType);
      setStateMap((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? EMPTY_SAVED_STATE), [category]: value },
      }));
    },
    [],
  );

  return { user, stateMap, markSaved, refetch };
}

export function getSavedState(
  stateMap: Record<string, SavedState>,
  id: number,
  mediaType: string,
): SavedState {
  return stateMap[itemKey(id, mediaType)] ?? EMPTY_SAVED_STATE;
}
