import type { SupabaseClient } from "@supabase/supabase-js";

export const TASTE_MATCH_MIN_SHARED = 5;

export type TasteMatch = {
  sharedCount: number;
  matchCount: number;
  /** null when sharedCount < TASTE_MATCH_MIN_SHARED -- not enough data yet. */
  percentage: number | null;
};

/**
 * Replaces "X Likes"/"X mal inspiriert" on foreign profiles: how well two
 * users' tastes align, based only on items BOTH independently rated
 * (like/dislike). Items only one of them rated don't count either way --
 * agreeing is a match (both like or both dislike), disagreeing isn't.
 */
export async function computeTasteMatch(
  supabase: SupabaseClient,
  ownerId: string,
  viewerId: string,
): Promise<TasteMatch> {
  const [{ data: ownerRows }, { data: viewerRows }] = await Promise.all([
    supabase
      .from("item_interactions")
      .select("item_id, media_type, interaction_type")
      .eq("user_id", ownerId)
      .in("interaction_type", ["like", "dislike"]),
    supabase
      .from("item_interactions")
      .select("item_id, media_type, interaction_type")
      .eq("user_id", viewerId)
      .in("interaction_type", ["like", "dislike"]),
  ]);

  const ownerByKey = new Map<string, "like" | "dislike">(
    (ownerRows ?? []).map((row) => [`${row.media_type}-${row.item_id}`, row.interaction_type as "like" | "dislike"]),
  );

  let sharedCount = 0;
  let matchCount = 0;
  for (const row of viewerRows ?? []) {
    const key = `${row.media_type}-${row.item_id}`;
    const ownerType = ownerByKey.get(key);
    if (!ownerType) continue;
    sharedCount += 1;
    if (ownerType === row.interaction_type) matchCount += 1;
  }

  return {
    sharedCount,
    matchCount,
    percentage:
      sharedCount >= TASTE_MATCH_MIN_SHARED ? Math.round((matchCount / sharedCount) * 100) : null,
  };
}
