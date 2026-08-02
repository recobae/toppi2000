import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type SocialProofGroup = {
  usernames: string[];
  total: number;
};

export type SocialProofBreakdown = {
  positive: SocialProofGroup; // liked OR in top_list, deduplicated per person
  watchlist: SocialProofGroup;
  dontWatch: SocialProofGroup;
};

export type SocialProofItem = {
  id: number;
  mediaType: "movie" | "tv";
};

const EMPTY_GROUP: SocialProofGroup = { usernames: [], total: 0 };
export const EMPTY_SOCIAL_PROOF: SocialProofBreakdown = {
  positive: EMPTY_GROUP,
  watchlist: EMPTY_GROUP,
  dontWatch: EMPTY_GROUP,
};

function itemKey(id: number, mediaType: string) {
  return `${mediaType === "tv" ? "tv" : "movie"}-${id}`;
}

type Row = { user_id: string; item_id: number; media_type: string };

/**
 * For a batch of items, finds which of the current user's followed friends
 * already liked/top-listed, watchlisted, or dont-watched each one. Runs a
 * fixed, small number of batched queries per call -- never one per card.
 * Empty for guests or once nobody in the follow graph matches.
 */
export function useSocialProof(items: SocialProofItem[]) {
  const [proofMap, setProofMap] = useState<
    Record<string, SocialProofBreakdown>
  >({});

  const itemsKey = items.map((item) => itemKey(item.id, item.mediaType)).join(",");

  useEffect(() => {
    if (items.length === 0) {
      setProofMap({});
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

      const [likesResult, topListResult, watchlistResult, dontWatchResult] =
        await Promise.all([
          // Reads from item_interactions (interaction_type = "like"), not the
          // legacy `likes` table -- the app stopped writing to `likes` once
          // item_interactions became the single source of truth for
          // like/dislike, so `likes` no longer reflects anything recorded
          // after that migration.
          supabase
            .from("item_interactions")
            .select("user_id, item_id, media_type")
            .eq("interaction_type", "like")
            .in("user_id", followedIds)
            .in("item_id", itemIds.map(String)),
          supabase
            .from("top_list")
            .select("user_id, item_id, media_type")
            .in("user_id", followedIds)
            .in("item_id", itemIds),
          supabase
            .from("watchlist")
            .select("user_id, item_id, media_type")
            .in("user_id", followedIds)
            .in("item_id", itemIds),
          supabase
            .from("dont_watch")
            .select("user_id, item_id, media_type")
            .in("user_id", followedIds)
            .in("item_id", itemIds),
        ]);

      const likesRows = ((likesResult.data ?? []) as { user_id: string; item_id: string; media_type: string }[]).map(
        (row) => ({ user_id: row.user_id, item_id: Number(row.item_id), media_type: row.media_type }),
      );
      const topListRows = (topListResult.data ?? []) as Row[];
      const watchlistRows = (watchlistResult.data ?? []) as Row[];
      const dontWatchRows = (dontWatchResult.data ?? []) as Row[];

      const allRows = [
        ...likesRows,
        ...topListRows,
        ...watchlistRows,
        ...dontWatchRows,
      ];
      if (allRows.length === 0) return;

      const userIds = [...new Set(allRows.map((row) => row.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", userIds);
      const usernameByUserId = new Map(
        (profiles ?? []).map((profile) => [profile.id, profile.username]),
      );

      const positiveByKey = new Map<string, Set<string>>();
      const watchlistByKey = new Map<string, Set<string>>();
      const dontWatchByKey = new Map<string, Set<string>>();

      const addTo = (map: Map<string, Set<string>>, rows: Row[]) => {
        for (const row of rows) {
          const username = usernameByUserId.get(row.user_id);
          if (!username) continue;
          const key = itemKey(row.item_id, row.media_type);
          if (!map.has(key)) map.set(key, new Set());
          map.get(key)!.add(username);
        }
      };

      addTo(positiveByKey, likesRows);
      addTo(positiveByKey, topListRows);
      addTo(watchlistByKey, watchlistRows);
      addTo(dontWatchByKey, dontWatchRows);

      if (cancelled) return;

      const keys = new Set([
        ...positiveByKey.keys(),
        ...watchlistByKey.keys(),
        ...dontWatchByKey.keys(),
      ]);
      const nextMap: Record<string, SocialProofBreakdown> = {};
      for (const key of keys) {
        const toGroup = (set?: Set<string>): SocialProofGroup => {
          if (!set || set.size === 0) return EMPTY_GROUP;
          const usernames = [...set];
          return { usernames, total: usernames.length };
        };
        nextMap[key] = {
          positive: toGroup(positiveByKey.get(key)),
          watchlist: toGroup(watchlistByKey.get(key)),
          dontWatch: toGroup(dontWatchByKey.get(key)),
        };
      }
      setProofMap(nextMap);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey]);

  return proofMap;
}

export function getSocialProofBreakdown(
  proofMap: Record<string, SocialProofBreakdown>,
  id: number,
  mediaType: string,
): SocialProofBreakdown {
  return proofMap[itemKey(id, mediaType)] ?? EMPTY_SOCIAL_PROOF;
}
