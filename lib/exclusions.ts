import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one, global "has this user already dealt with this item" rule --
 * every feed/recommendation surface in the app calls one of these instead
 * of rolling its own exclusion query. An item counts as "handled" the
 * moment the user liked it (item_interactions, permanent -- liking always
 * also saves it onto one of their own list tables anyway), sits on one of
 * the user's own list tables, or has an unexpired 30-day resurfacing timer
 * (lib/item-skips.ts). "Nix für mich" (dislike) deliberately does NOT
 * exclude permanently here -- lib/rating.ts's recordDislike always pairs a
 * dislike with the same 30-day timer, so a disliked item resurfaces on its
 * own once expires_at passes, exactly like the old "Skip" used to (Skip no
 * longer exists as a separate concept; this is what replaced it).
 */

export async function getExcludedMovieKeys(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const now = new Date().toISOString();
  const [{ data: likes }, { data: topList }, { data: watchlist }, { data: skips }] =
    await Promise.all([
      supabase
        .from("item_interactions")
        .select("item_id, media_type")
        .eq("user_id", userId)
        .eq("interaction_type", "like")
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
  for (const rows of [likes, topList, watchlist, skips]) {
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
  const [{ data: likes }, { data: places }, { data: skips }] = await Promise.all([
    supabase
      .from("item_interactions")
      .select("item_id")
      .eq("user_id", userId)
      .eq("interaction_type", "like")
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
  for (const row of likes ?? []) ids.add(row.item_id);
  for (const row of places ?? []) ids.add(row.google_place_id);
  for (const row of skips ?? []) ids.add(row.item_id);
  return ids;
}
