import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Places have a single saved/not-saved state per user (no ranking
 * categories like the movie lists) -- just a set of already-saved
 * google_place_ids, batch-fetched once instead of per-card.
 */
export function usePlaceSavedState(userId: string | null | undefined) {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const refetch = useCallback(async () => {
    if (!userId) {
      setSavedIds(new Set());
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("places")
      .select("google_place_id")
      .eq("user_id", userId);
    setSavedIds(new Set((data ?? []).map((row) => row.google_place_id)));
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const markSaved = useCallback((placeId: string, value: boolean) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (value) next.add(placeId);
      else next.delete(placeId);
      return next;
    });
  }, []);

  return { savedIds, markSaved, refetch };
}
