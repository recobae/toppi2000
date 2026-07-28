import type { SupabaseClient } from "@supabase/supabase-js";

export type ItemRatingCounts = {
  up: number;
  down: number;
  myVote: boolean | null;
};

const EMPTY_COUNTS: ItemRatingCounts = { up: 0, down: 0, myVote: null };

function itemKey(itemId: number, mediaType: string) {
  return `${mediaType}-${itemId}`;
}

/**
 * Batch-loads like/dislike counts (and the current viewer's own vote) on
 * another user's list items -- this is the "rate someone else's curation"
 * feature, unrelated to the viewer's own likes/top_list/watchlist/dont_watch.
 */
export async function getItemRatings(
  supabase: SupabaseClient,
  ownerId: string,
  viewerId: string | null,
  items: { itemId: number; mediaType: "movie" | "tv" }[],
): Promise<Record<string, ItemRatingCounts>> {
  if (items.length === 0) return {};

  const itemIds = [...new Set(items.map((item) => item.itemId))];
  const { data, error } = await supabase
    .from("item_ratings")
    .select("rater_id, item_id, media_type, vote")
    .eq("owner_id", ownerId)
    .in("item_id", itemIds);

  if (error || !data) return {};

  const map: Record<string, ItemRatingCounts> = {};
  for (const row of data) {
    const key = itemKey(row.item_id, row.media_type);
    if (!map[key]) map[key] = { ...EMPTY_COUNTS };
    if (row.vote) map[key].up += 1;
    else map[key].down += 1;
    if (viewerId && row.rater_id === viewerId) {
      map[key].myVote = row.vote;
    }
  }
  return map;
}

export function getItemRatingCounts(
  map: Record<string, ItemRatingCounts>,
  itemId: number,
  mediaType: string,
): ItemRatingCounts {
  return map[itemKey(itemId, mediaType)] ?? EMPTY_COUNTS;
}

export async function rateItem(
  supabase: SupabaseClient,
  ownerId: string,
  raterId: string,
  itemId: number,
  mediaType: "movie" | "tv",
  vote: boolean,
) {
  return supabase.from("item_ratings").upsert(
    { owner_id: ownerId, rater_id: raterId, item_id: itemId, media_type: mediaType, vote },
    { onConflict: "owner_id,rater_id,item_id,media_type" },
  );
}
