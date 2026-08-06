import type { SupabaseClient } from "@supabase/supabase-js";

export type ForMeStatus = {
  ownCount: number;
  friendCount: number;
  /** Distinct followed friends who actually contributed a recommendation feeding this user's Topf -- not just anyone followed. */
  contributorUserIds: string[];
};

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
 * The single "own broadened activity" count -- every active capture (swiped,
 * imported, added via Für Dich/search): item_interactions (like+dislike) +
 * top_list + watchlist + dont_watch + places + active recommendations.
 * Deliberately an added sum, not a deduped set across item identities (the
 * tables use different identity schemes -- TMDB item_id+media_type for
 * movies, place_id for Orte, category_key+external_id for Mein-Topf).
 * Single-user version of the per-friend loop inside getForMeStatus below;
 * used both for a foreign profile's "X Bewertungen von {username}" line
 * (app/u/[username]/page.tsx) and for the viewer's own "X Bewertungen von
 * dir" stat, which now lives on /fuer-dich instead of the profile header.
 */
export async function getTotalActivityCount(supabase: SupabaseClient, userId: string): Promise<number> {
  const [
    { count: interactionsCount },
    { count: topListCount },
    { count: watchlistCount },
    { count: dontWatchCount },
    { count: placesCount },
    { count: recommendationsCount },
  ] = await Promise.all([
    supabase.from("item_interactions").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("top_list").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("watchlist").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("dont_watch").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("places").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);
  return (
    (interactionsCount ?? 0) +
    (topListCount ?? 0) +
    (watchlistCount ?? 0) +
    (dontWatchCount ?? 0) +
    (placesCount ?? 0) +
    (recommendationsCount ?? 0)
  );
}

/**
 * Resolves what /fuer-dich's own-activity stat block needs: own total-activity
 * count (every active capture -- swiped, entered, imported, added via
 * Inspiration or search; see app/u/[username]/page.tsx's totalActivityCount)
 * and the same broadened sum across followed friends. `ownCount` is passed
 * in rather than recomputed here since the caller already has to gather all
 * the underlying per-table counts for its own profile-page rendering anyway.
 * The old unlock-ring/threshold machinery is gone -- that whole discovery
 * experience now lives on /fuer-dich instead of gating a profile widget.
 */
export async function getForMeStatus(
  supabase: SupabaseClient,
  userId: string,
  ownCount: number,
): Promise<ForMeStatus> {
  const [contributorUserIds, { data: followRows }] = await Promise.all([
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

  return { ownCount, friendCount, contributorUserIds };
}
