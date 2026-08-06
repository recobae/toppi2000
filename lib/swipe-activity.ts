import type { SupabaseClient } from "@supabase/supabase-js";

const DAY_MS = 24 * 60 * 60 * 1000;

function since(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

/**
 * Records one swiped/dismissed Quick-Swipe card -- independent of which of
 * the two ratings (like/dislike) it was, and separate from the actual save,
 * which always goes through likeAndSaveCandidate/recordDislike. No daily
 * limit is enforced anymore (Quick-Swipe is unlimited as long as candidates
 * exist); this table now exists purely as the timestamped activity log
 * behind the "Du hast heute X Signale gesammelt"-style motivation messages
 * and session/30-day-repeat instrumentation. Best-effort: a failure here
 * should never block or roll back an already-successful save.
 */
export async function recordSwipeCardAction(supabase: SupabaseClient, userId: string) {
  return supabase.from("swipe_card_actions").insert({ user_id: userId });
}

/** How many cards the user has swiped today -- the one real number "Du hast heute X neue Geschmackssignale gesammelt" is allowed to show. */
export async function getTodaySwipeCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from("swipe_card_actions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since(DAY_MS));
  return count ?? 0;
}
