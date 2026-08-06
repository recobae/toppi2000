import type { SupabaseClient } from "@supabase/supabase-js";

export const SWIPE_DAILY_LIMIT = 20;
const SWIPE_WINDOW_MS = 24 * 60 * 60 * 1000;

function swipeWindowSince(): string {
  return new Date(Date.now() - SWIPE_WINDOW_MS).toISOString();
}

export type SwipeQuota = {
  /** null = unlimited (cold start: the user has never swiped a card before). */
  remaining: number | null;
};

/**
 * 20 cards per rolling 24h, except a user's very first-ever call to this --
 * detected as "zero swipe_card_actions rows exist yet" -- which is exempt
 * entirely (the cold-start moment right after registration). The instant a
 * first row exists, the cap applies from then on, including later within
 * that same first sitting.
 */
export async function getSwipeQuota(supabase: SupabaseClient, userId: string): Promise<SwipeQuota> {
  const { count: totalEver } = await supabase
    .from("swipe_card_actions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (!totalEver) return { remaining: null };

  const { count: todayCount } = await supabase
    .from("swipe_card_actions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", swipeWindowSince());

  return { remaining: Math.max(0, SWIPE_DAILY_LIMIT - (todayCount ?? 0)) };
}

/**
 * Records one swiped/dismissed card for daily-limit tracking only --
 * independent of which of the two ratings (like/dislike) it was, and
 * separate from the actual save, which always goes through
 * likeAndSaveCandidate/recordDislike. Best-effort: a failure here should
 * never block or roll back an already-successful save.
 */
export async function recordSwipeCardAction(supabase: SupabaseClient, userId: string) {
  return supabase.from("swipe_card_actions").insert({ user_id: userId });
}
