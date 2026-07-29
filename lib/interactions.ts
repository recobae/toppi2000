import type { SupabaseClient } from "@supabase/supabase-js";

// The single, generic source of truth for "I like/dislike/skip this item" --
// independent of whether it's on any list. Supersedes the older "likes" and
// "item_ratings" tables (both left untouched in the DB for their historical
// data, but no longer written to by the app).
//
// item_id is a string, not the TMDB-only number used elsewhere in the app --
// it also has to hold Google Place IDs (e.g. "ChIJhd5N...") for the Orte
// category, so every call site converts a numeric TMDB id via String(id).
export type InteractionType = "like" | "dislike" | "skip";
export type InteractionMediaType = "movie" | "tv" | "place";

export type Interaction = {
  itemId: string;
  mediaType: InteractionMediaType;
  interactionType: InteractionType;
  targetUserId: string | null;
};

/**
 * Records (or overwrites) the current user's interaction with an item.
 * A user can only have one active interaction per item -- liking something
 * you'd previously disliked replaces the row rather than stacking a second
 * one, matching "Meine Aktivität"'s "ändern" affordance.
 */
export async function recordInteraction(
  supabase: SupabaseClient,
  userId: string,
  params: {
    itemId: string;
    mediaType: InteractionMediaType;
    interactionType: InteractionType;
    targetUserId?: string | null;
  },
) {
  return supabase.from("item_interactions").upsert(
    {
      user_id: userId,
      target_user_id: params.targetUserId ?? null,
      item_id: params.itemId,
      media_type: params.mediaType,
      interaction_type: params.interactionType,
    },
    { onConflict: "user_id,item_id,media_type" },
  );
}

export async function removeInteraction(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  mediaType: InteractionMediaType,
) {
  return supabase
    .from("item_interactions")
    .delete()
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .eq("media_type", mediaType);
}
