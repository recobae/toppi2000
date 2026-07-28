import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type SocialProofEntry = {
  usernames: string[];
  total: number;
};

export type SocialProofItem = {
  id: number;
  mediaType: "movie" | "tv";
};

function itemKey(id: number, mediaType: string) {
  return `${mediaType === "tv" ? "tv" : "movie"}-${id}`;
}

/**
 * For a batch of items (e.g. one page of search/trending/discover results),
 * finds which of the current user's followed friends already saved each
 * item to one of their lists. Runs as a small, fixed number of batched
 * queries per call -- never one query per card. Returns an empty map for
 * guests (no follow graph) or once nothing matches.
 */
export function useSocialProof(items: SocialProofItem[]) {
  const [proofMap, setProofMap] = useState<Record<string, SocialProofEntry>>(
    {},
  );

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

      const { data: followedLists } = await supabase
        .from("lists")
        .select("id, user_id")
        .in("user_id", followedIds);
      const listRows = followedLists ?? [];
      if (listRows.length === 0) return;

      const listIds = listRows.map((list) => list.id);
      const ownerByListId = new Map(
        listRows.map((list) => [list.id, list.user_id]),
      );

      const externalIds = [...new Set(items.map((item) => item.id))];
      const { data: matchingItems } = await supabase
        .from("list_items")
        .select("list_id, external_id, metadata")
        .in("list_id", listIds)
        .in("external_id", externalIds);
      const rows = matchingItems ?? [];
      if (rows.length === 0) return;

      const ownerIds = [
        ...new Set(
          rows
            .map((row) => ownerByListId.get(row.list_id))
            .filter((id): id is string => !!id),
        ),
      ];
      const { data: ownerProfiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", ownerIds);
      const usernameByOwnerId = new Map(
        (ownerProfiles ?? []).map((profile) => [profile.id, profile.username]),
      );

      const usernamesByKey = new Map<string, Set<string>>();
      for (const row of rows) {
        const ownerId = ownerByListId.get(row.list_id);
        const username = ownerId ? usernameByOwnerId.get(ownerId) : undefined;
        if (!username) continue;

        const key = itemKey(Number(row.external_id), row.metadata?.type ?? "movie");
        if (!usernamesByKey.has(key)) usernamesByKey.set(key, new Set());
        usernamesByKey.get(key)!.add(username);
      }

      if (cancelled) return;
      const nextMap: Record<string, SocialProofEntry> = {};
      for (const [key, usernames] of usernamesByKey) {
        const usernameList = [...usernames];
        nextMap[key] = { usernames: usernameList, total: usernameList.length };
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

export function getSocialProofEntry(
  proofMap: Record<string, SocialProofEntry>,
  id: number,
  mediaType: string,
): SocialProofEntry | undefined {
  return proofMap[itemKey(id, mediaType)];
}
