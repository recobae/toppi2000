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
 * Distinct followed friends explicitly tagged as "Wer empfiehlt das?" on
 * one of `userId`'s own active Topf entries -- drives the Sparkles corner
 * badge on FollowingBar avatars. Extracted out of getForMeStatus so the
 * profile page can compute it for a FOREIGN profile's FollowingBar too,
 * without paying for the unlock-threshold/preview-image work that's own-
 * profile-only.
 */
export async function getTopfContributorIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data: allIdRows } = await supabase
    .from("recommendations")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active");
  const allIds = (allIdRows ?? []).map((row) => row.id);
  if (allIds.length === 0) return [];

  const { data: recommenderRows } = await supabase
    .from("recommendation_recommenders")
    .select("recommender_user_id")
    .in("recommendation_id", allIds)
    .neq("recommender_user_id", userId);
  return [...new Set((recommenderRows ?? []).map((row) => row.recommender_user_id))];
}

/**
 * Resolves everything the "For Me" tile needs: own total-activity count
 * (every active capture -- swiped, entered, imported, added via Inspiration
 * or search; see app/u/[username]/page.tsx's totalActivityCount), distinct
 * friend-contribution count to the viewer's own Topf, the (lazily rolled,
 * then persisted) unlock threshold, and a couple of real recent Topf
 * thumbnails to blur behind the tile while locked. `ownCount` is passed in
 * rather than recomputed here since the caller already has to gather all the
 * underlying per-table counts for its own profile-page rendering anyway.
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

  const [{ data: recentRows }, contributorUserIds, { data: followRows }] = await Promise.all([
    supabase
      .from("recommendations")
      .select("metadata")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(6),
    getTopfContributorIds(supabase, userId),
    supabase.from("user_follows").select("followed_id").eq("follower_id", userId),
  ]);

  // friendCount: total ACTIVITY of followed friends, same broadened
  // definition as the profile page's own totalActivityCount (item_
  // interactions + top_list + watchlist + dont_watch + places +
  // recommendations) -- summed across every followed friend, not just their
  // Mein-Topf entries. The previous recommendations-only definition read 0
  // for most test accounts: swiping/rating never touches the recommendations
  // table at all (that's a separate, manually-filled "Wer empfiehlt das?"
  // pot), so a followed friend who's been swiping heavily but never used
  // Mein Topf still counted as 0 -- deliberately a different (broader)
  // population than contributorUserIds above, which stays attribution-only.
  const followedIds = (followRows ?? []).map((row) => row.followed_id);
  let friendCount = 0;
  if (followedIds.length > 0) {
    const [
      { count: interactionsCount },
      { count: topListCount },
      { count: watchlistCount },
      { count: dontWatchCount },
      { count: placesCount },
      { count: recommendationsCount },
    ] = await Promise.all([
      supabase.from("item_interactions").select("id", { count: "exact", head: true }).in("user_id", followedIds),
      supabase.from("top_list").select("id", { count: "exact", head: true }).in("user_id", followedIds),
      supabase.from("watchlist").select("id", { count: "exact", head: true }).in("user_id", followedIds),
      supabase.from("dont_watch").select("id", { count: "exact", head: true }).in("user_id", followedIds),
      supabase.from("places").select("id", { count: "exact", head: true }).in("user_id", followedIds),
      supabase
        .from("recommendations")
        .select("id", { count: "exact", head: true })
        .in("user_id", followedIds)
        .eq("status", "active"),
    ]);
    friendCount =
      (interactionsCount ?? 0) +
      (topListCount ?? 0) +
      (watchlistCount ?? 0) +
      (dontWatchCount ?? 0) +
      (placesCount ?? 0) +
      (recommendationsCount ?? 0);
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
