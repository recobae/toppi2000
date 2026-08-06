import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InteractionMediaType } from "@/lib/interactions";

export type OtherRatersItem = { id: string; mediaType: InteractionMediaType };
export type OtherRatersBreakdown = { like: string[]; dislike: string[] };

const EMPTY: OtherRatersBreakdown = { like: [], dislike: [] };

function itemKey(id: string, mediaType: string): string {
  return `${mediaType}-${id}`;
}

/**
 * For items on someone else's list, finds which OTHER followed friends
 * (never the viewer themselves) already liked or disliked each one -- backs
 * the "Auch von [Name] geliked/nicht gemocht" line, shown once the viewer
 * has rated the item too. Reuses the same item_interactions source and
 * follow-graph scoping as lib/hooks/use-social-proof.ts, just split cleanly
 * into like vs dislike (that hook's "positive" group merges likes with
 * top_list adds, which this needs to keep separate and dislike-aware).
 */
export function useOtherRaters(items: OtherRatersItem[]) {
  const [map, setMap] = useState<Record<string, OtherRatersBreakdown>>({});
  const itemsKey = items.map((item) => itemKey(item.id, item.mediaType)).join(",");

  useEffect(() => {
    if (items.length === 0) {
      setMap({});
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: followRows } = await supabase
        .from("user_follows")
        .select("followed_id")
        .eq("follower_id", user.id);
      const followedIds = (followRows ?? []).map((row) => row.followed_id);
      if (followedIds.length === 0) return;

      const itemIds = [...new Set(items.map((item) => item.id))];
      const { data } = await supabase
        .from("item_interactions")
        .select("user_id, item_id, media_type, interaction_type")
        .in("interaction_type", ["like", "dislike"])
        .in("user_id", followedIds)
        .in("item_id", itemIds);
      if (cancelled || !data || data.length === 0) return;

      const userIds = [...new Set(data.map((row) => row.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", userIds);
      const usernameByUserId = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]));

      const next: Record<string, OtherRatersBreakdown> = {};
      for (const row of data) {
        const username = usernameByUserId.get(row.user_id);
        if (!username) continue;
        const key = itemKey(row.item_id, row.media_type);
        const entry = next[key] ?? { like: [], dislike: [] };
        if (row.interaction_type === "like") entry.like.push(username);
        else entry.dislike.push(username);
        next[key] = entry;
      }
      if (!cancelled) setMap(next);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  const get = (id: string, mediaType: InteractionMediaType): OtherRatersBreakdown => map[itemKey(id, mediaType)] ?? EMPTY;
  return { get };
}

/** "Anna" / "Anna und Max" / "3 weiteren Personen" -- no technical ids, reuses the app's existing "first name(s), then a count" pattern instead of a comma-joined list. */
export function formatOtherRaters(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} und ${names[1]}`;
  return `${names.length} weiteren Personen`;
}
