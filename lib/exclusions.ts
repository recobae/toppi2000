import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one, global "has this user already dealt with this item" rule --
 * every feed/recommendation surface in the app (Inspiration trending,
 * genre/sort filters, friends-likes, friend feed, city feed, and the
 * suggestion strips under a user's own lists) calls one of these instead of
 * rolling its own exclusion query. An item counts as "handled" the moment
 * it has ANY item_interactions row (like/dislike), sits on one of the
 * user's own list tables, or has an unexpired skip (lib/item-skips.ts),
 * regardless of which screen that happened on. A skip is temporary -- once
 * expires_at passes, the item resurfaces on its own with no extra query
 * changes needed.
 */

export async function getExcludedMovieKeys(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const now = new Date().toISOString();
  const [{ data: interactions }, { data: topList }, { data: watchlist }, { data: skips }] =
    await Promise.all([
      supabase
        .from("item_interactions")
        .select("item_id, media_type")
        .eq("user_id", userId)
        .in("media_type", ["movie", "tv"]),
      supabase.from("top_list").select("item_id, media_type").eq("user_id", userId),
      supabase.from("watchlist").select("item_id, media_type").eq("user_id", userId),
      supabase
        .from("item_skips")
        .select("item_id, media_type")
        .eq("user_id", userId)
        .in("media_type", ["movie", "tv"])
        .gt("expires_at", now),
    ]);

  const keys = new Set<string>();
  for (const rows of [interactions, topList, watchlist, skips]) {
    for (const row of rows ?? []) {
      keys.add(`${row.media_type}-${row.item_id}`);
    }
  }
  return keys;
}

export async function getExcludedPlaceIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const now = new Date().toISOString();
  const [{ data: interactions }, { data: places }, { data: skips }] = await Promise.all([
    supabase
      .from("item_interactions")
      .select("item_id")
      .eq("user_id", userId)
      .eq("media_type", "place"),
    supabase.from("places").select("google_place_id").eq("user_id", userId),
    supabase
      .from("item_skips")
      .select("item_id")
      .eq("user_id", userId)
      .eq("media_type", "place")
      .gt("expires_at", now),
  ]);

  const ids = new Set<string>();
  for (const row of interactions ?? []) ids.add(row.item_id);
  for (const row of places ?? []) ids.add(row.google_place_id);
  for (const row of skips ?? []) ids.add(row.item_id);
  return ids;
}
