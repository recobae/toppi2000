import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The ring's nominal "full" mark -- own ratings (movies+places) plus
 * distinct friend contributions to your own Topf, combined. The REAL
 * unlock point is a per-user random value between MIN/MAX_FRACTION of this,
 * never this number itself, so the exact threshold is never predictable
 * from the visible ring fill (Abschnitt 4).
 */
const REFERENCE_MAX = 20;
const MIN_THRESHOLD_FRACTION = 0.8;
const MAX_THRESHOLD_FRACTION = 1.0;

export type ForMeStatus = {
  ownCount: number;
  friendCount: number;
  /** own + friend, uncapped -- used for the ring fraction (capped at 1) and the unlock comparison. */
  combinedCount: number;
  threshold: number;
  fraction: number;
  isUnlocked: boolean;
  /** True only the moment this call is the first to observe isUnlocked while topf_unlocked_notified was still false. */
  justUnlocked: boolean;
  previewImageUrls: string[];
  /** Distinct followed friends who actually contributed a recommendation feeding this user's Topf -- not just anyone followed. */
  contributorUserIds: string[];
};

function rollThreshold(): number {
  const min = Math.round(REFERENCE_MAX * MIN_THRESHOLD_FRACTION);
  const max = Math.round(REFERENCE_MAX * MAX_THRESHOLD_FRACTION);
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Resolves everything the "For Me" tile needs: own rating count, distinct
 * friend-contribution count to the viewer's own Topf, the (lazily rolled,
 * then persisted) unlock threshold, and a couple of real recent Topf
 * thumbnails to blur behind the tile while locked. `ownCount` is passed in
 * rather than recomputed here since app/u/[username]/page.tsx already
 * fetches movie+place interaction counts for ProgressBadges -- no reason to
 * query item_interactions a second time for the same numbers.
 */
export async function getForMeStatus(
  supabase: SupabaseClient,
  userId: string,
  ownCount: number,
): Promise<ForMeStatus> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("topf_unlock_threshold, topf_unlocked_notified")
    .eq("id", userId)
    .maybeSingle();

  let threshold = profile?.topf_unlock_threshold ?? null;
  if (threshold === null) {
    threshold = rollThreshold();
    await supabase.from("profiles").update({ topf_unlock_threshold: threshold }).eq("id", userId);
  }

  const [{ data: recentRows }, { data: allIdRows }, { data: followRows }] = await Promise.all([
    supabase
      .from("recommendations")
      .select("metadata")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("recommendations").select("id").eq("user_id", userId).eq("status", "active"),
    supabase.from("user_follows").select("followed_id").eq("follower_id", userId),
  ]);

  // contributorUserIds: still attribution-based (who was explicitly tagged
  // as "Wer empfiehlt das?" on one of THIS user's own entries) -- drives the
  // Sparkles corner badge on FollowingBar avatars, unchanged.
  let contributorUserIds: string[] = [];
  const allIds = (allIdRows ?? []).map((row) => row.id);
  if (allIds.length > 0) {
    const { data: recommenderRows } = await supabase
      .from("recommendation_recommenders")
      .select("recommender_user_id")
      .in("recommendation_id", allIds)
      .neq("recommender_user_id", userId);
    contributorUserIds = [
      ...new Set((recommenderRows ?? []).map((row) => row.recommender_user_id)),
    ];
  }

  // friendCount: sum of ALL active recommendations followed friends have of
  // their own, regardless of explicit attribution -- deliberately a
  // different (broader) definition than contributorUserIds above.
  const followedIds = (followRows ?? []).map((row) => row.followed_id);
  let friendCount = 0;
  if (followedIds.length > 0) {
    const { count } = await supabase
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .in("user_id", followedIds)
      .eq("status", "active");
    friendCount = count ?? 0;
  }

  const previewImageUrls = (recentRows ?? [])
    .map((row) => (row.metadata as { imageUrl?: string } | null)?.imageUrl)
    .filter((url): url is string => !!url)
    .slice(0, 3);

  const combinedCount = ownCount + friendCount;
  const isUnlocked = combinedCount >= threshold;
  const justUnlocked = isUnlocked && !profile?.topf_unlocked_notified;

  return {
    ownCount,
    friendCount,
    combinedCount,
    threshold,
    fraction: Math.min(1, combinedCount / REFERENCE_MAX),
    isUnlocked,
    justUnlocked,
    previewImageUrls,
    contributorUserIds,
  };
}

export async function markForMeUnlockNotified(supabase: SupabaseClient, userId: string) {
  return supabase.from("profiles").update({ topf_unlocked_notified: true }).eq("id", userId);
}
