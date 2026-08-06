import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Records one swiped/dismissed Quick-Swipe card -- independent of which of
 * the two ratings (like/dislike) it was, and separate from the actual save,
 * which always goes through likeAndSaveCandidate/recordDislike. No daily
 * limit is enforced anymore (Quick-Swipe is unlimited as long as candidates
 * exist). This table is a supplementary activity log only -- the
 * authoritative "how many ratings today" number lives on item_interactions
 * itself (lib/interactions.ts#getTodayInteractionCount), not here. Best-
 * effort: a failure here should never block or roll back an already-
 * successful save.
 */
export async function recordSwipeCardAction(supabase: SupabaseClient, userId: string) {
  return supabase.from("swipe_card_actions").insert({ user_id: userId });
}
