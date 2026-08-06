import type { SupabaseClient } from "@supabase/supabase-js";
import { startOfTodayInTimeZone } from "@/lib/timezone";

// The single, generic source of truth for "I like/dislike this item" --
// independent of whether it's on any list. Supersedes the older "likes" and
// "item_ratings" tables, which the app no longer reads or writes at all
// (their historical rows just sit unused in the DB). "Skip" is a
// deliberately separate concept (lib/item-skips.ts, its own table) -- it
// makes no taste statement, so it must never appear here; taste-match,
// progress badges and everything else that reads item_interactions can
// assume every row is a real opinion.
export type InteractionType = "like" | "dislike";
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

/**
 * How many like/dislike item_interactions rows this user has as of today
 * (Europe/Berlin calendar day) -- the single source of truth for the
 * "Heute X neue Bewertungen"-toast (My Taste's Quick-Swipe). Deliberately
 * reads `updated_at`, not `created_at`: recordInteraction upserts on
 * conflict, so a dislike from weeks ago that resurfaces and gets liked
 * today updates its existing row rather than inserting a new one --
 * `created_at` would miss that, `updated_at` (bumped by a DB trigger on
 * every insert/update, see the accompanying migration) doesn't. Counts
 * only like/dislike, matching the two ratings that exist anywhere in the
 * app now -- never Skip/Battle/detail-view opens/list views/notes, none of
 * which write here.
 */
export async function getTodayInteractionCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const startOfToday = startOfTodayInTimeZone("Europe/Berlin");
  const { count } = await supabase
    .from("item_interactions")
    // "*" (not a specific column) -- item_interactions is keyed by
    // (user_id, item_id, media_type), not a separate "id" column, so a
    // named-column count select would fail here.
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("interaction_type", ["like", "dislike"])
    .gte("updated_at", startOfToday.toISOString());
  return count ?? 0;
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
