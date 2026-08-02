import type { SupabaseClient } from "@supabase/supabase-js";

export const TASTE_MATCH_MIN_SHARED = 5;

// Above the minimum but still a thin sample -- a 100% match from 5 items
// isn't as meaningful as one from 50, so the UI flags it as low-confidence
// rather than hiding it outright.
export const TASTE_MATCH_LOW_CONFIDENCE_MAX = 8;

export type CategoryTasteMatch = {
  sharedCount: number;
  matchCount: number;
  /** null when sharedCount < TASTE_MATCH_MIN_SHARED -- not enough data yet. */
  percentage: number | null;
  /** true when TASTE_MATCH_MIN_SHARED <= sharedCount <= TASTE_MATCH_LOW_CONFIDENCE_MAX. */
  isLowConfidence: boolean;
};

export type TasteMatch = {
  movies: CategoryTasteMatch;
  places: CategoryTasteMatch;
};

export type SharedRating = {
  itemId: string;
  mediaType: string;
  ownerType: "like" | "dislike";
  viewerType: "like" | "dislike";
  isMatch: boolean;
};

function buildCategoryMatch(sharedCount: number, matchCount: number): CategoryTasteMatch {
  return {
    sharedCount,
    matchCount,
    percentage: sharedCount >= TASTE_MATCH_MIN_SHARED ? Math.round((matchCount / sharedCount) * 100) : null,
    isLowConfidence: sharedCount >= TASTE_MATCH_MIN_SHARED && sharedCount <= TASTE_MATCH_LOW_CONFIDENCE_MAX,
  };
}

/**
 * The one query both computeTasteMatch (the percentage) and the "show me
 * the actual titles" breakdown (app/api/taste-match-details) build on:
 * every item BOTH users rated (like or dislike), each tagged with whether
 * they agreed. Reads exclusively from item_interactions -- never
 * item_skips or any list table -- so a skip or a watchlist add can never
 * masquerade as a taste match.
 */
export async function getSharedRatings(
  supabase: SupabaseClient,
  ownerId: string,
  viewerId: string,
): Promise<SharedRating[]> {
  const [{ data: ownerRows }, { data: viewerRows }] = await Promise.all([
    supabase
      .from("item_interactions")
      .select("item_id, media_type, interaction_type")
      .eq("user_id", ownerId)
      .in("interaction_type", ["like", "dislike"]),
    supabase
      .from("item_interactions")
      .select("item_id, media_type, interaction_type")
      .eq("user_id", viewerId)
      .in("interaction_type", ["like", "dislike"]),
  ]);

  const ownerByKey = new Map<string, "like" | "dislike">(
    (ownerRows ?? []).map((row) => [`${row.media_type}-${row.item_id}`, row.interaction_type as "like" | "dislike"]),
  );

  const shared: SharedRating[] = [];
  for (const row of viewerRows ?? []) {
    const key = `${row.media_type}-${row.item_id}`;
    const ownerType = ownerByKey.get(key);
    if (!ownerType) continue;
    const viewerType = row.interaction_type as "like" | "dislike";
    shared.push({
      itemId: row.item_id,
      mediaType: row.media_type,
      ownerType,
      viewerType,
      isMatch: ownerType === viewerType,
    });
  }
  return shared;
}

/**
 * Replaces "X Likes"/"X mal inspiriert" on foreign profiles: how well two
 * users' tastes align, based only on items BOTH independently rated
 * (like/dislike). Items only one of them rated don't count either way --
 * agreeing is a match (both like or both dislike), disagreeing isn't.
 *
 * Computed separately for movies/tv vs. places -- item_interactions holds
 * both media families in one table, and mixing them into a single score
 * would let a handful of place ratings quietly skew (or pad) a movie
 * compatibility number, or vice versa.
 */
export async function computeTasteMatch(
  supabase: SupabaseClient,
  ownerId: string,
  viewerId: string,
): Promise<TasteMatch> {
  const shared = await getSharedRatings(supabase, ownerId, viewerId);

  let movieShared = 0;
  let movieMatch = 0;
  let placeShared = 0;
  let placeMatch = 0;
  for (const entry of shared) {
    if (entry.mediaType === "place") {
      placeShared += 1;
      if (entry.isMatch) placeMatch += 1;
    } else {
      movieShared += 1;
      if (entry.isMatch) movieMatch += 1;
    }
  }

  return {
    movies: buildCategoryMatch(movieShared, movieMatch),
    places: buildCategoryMatch(placeShared, placeMatch),
  };
}

/**
 * Same match/percentage logic as computeTasteMatch, batched across many
 * owners against one fixed viewer -- e.g. the profile owner's Ich-folge bar,
 * where every followed friend's badge is matched against the same viewer
 * (the profile owner). Runs exactly 2 item_interactions queries total
 * (one `user_id IN (ownerIds)`, one for the single viewerId) instead of one
 * computeTasteMatch call (2 queries) per owner.
 */
export async function computeTasteMatchBatch(
  supabase: SupabaseClient,
  ownerIds: string[],
  viewerId: string,
): Promise<Map<string, TasteMatch>> {
  const result = new Map<string, TasteMatch>();
  if (ownerIds.length === 0) return result;

  const [{ data: ownerRows }, { data: viewerRows }] = await Promise.all([
    supabase
      .from("item_interactions")
      .select("user_id, item_id, media_type, interaction_type")
      .in("user_id", ownerIds)
      .in("interaction_type", ["like", "dislike"]),
    supabase
      .from("item_interactions")
      .select("item_id, media_type, interaction_type")
      .eq("user_id", viewerId)
      .in("interaction_type", ["like", "dislike"]),
  ]);

  const viewerByKey = new Map<string, "like" | "dislike">(
    (viewerRows ?? []).map((row) => [`${row.media_type}-${row.item_id}`, row.interaction_type as "like" | "dislike"]),
  );

  const rowsByOwnerId = new Map<string, { media_type: string; item_id: string; interaction_type: string }[]>();
  for (const row of ownerRows ?? []) {
    if (!rowsByOwnerId.has(row.user_id)) rowsByOwnerId.set(row.user_id, []);
    rowsByOwnerId.get(row.user_id)!.push(row);
  }

  for (const ownerId of ownerIds) {
    let movieShared = 0;
    let movieMatch = 0;
    let placeShared = 0;
    let placeMatch = 0;
    for (const row of rowsByOwnerId.get(ownerId) ?? []) {
      const viewerType = viewerByKey.get(`${row.media_type}-${row.item_id}`);
      if (!viewerType) continue;
      const isMatch = viewerType === row.interaction_type;
      if (row.media_type === "place") {
        placeShared += 1;
        if (isMatch) placeMatch += 1;
      } else {
        movieShared += 1;
        if (isMatch) movieMatch += 1;
      }
    }
    result.set(ownerId, {
      movies: buildCategoryMatch(movieShared, movieMatch),
      places: buildCategoryMatch(placeShared, placeMatch),
    });
  }

  return result;
}

function formatCategorySegment(label: string, category: CategoryTasteMatch): string | null {
  if (category.percentage === null) return null;
  return `${label}: ${category.percentage}%${category.isLowConfidence ? " (wenige gemeinsame Bewertungen)" : ""}`;
}

/**
 * Single-line summary used everywhere the score is shown -- e.g. "Filme:
 * 87% · Orte: 62% (wenige gemeinsame Bewertungen)". Categories with too few
 * shared ratings are simply omitted rather than shown as 0%; if neither
 * category clears the threshold yet, falls back to a combined "not enough
 * data" message naming both counts.
 */
export function formatTasteMatchLabel(match: TasteMatch): string {
  const segments = [
    formatCategorySegment("Filme", match.movies),
    formatCategorySegment("Orte", match.places),
  ].filter((segment): segment is string => segment !== null);

  if (segments.length > 0) return segments.join(" · ");

  return `Noch nicht genug Daten (${match.movies.sharedCount}/${TASTE_MATCH_MIN_SHARED} Filme, ${match.places.sharedCount}/${TASTE_MATCH_MIN_SHARED} Orte gemeinsam bewertet)`;
}

/** The higher of the two category percentages, or null if neither has reached the threshold -- used for the compact FollowingBar badge. */
export function bestTasteMatchPercentage(match: TasteMatch): number | null {
  const values = [match.movies.percentage, match.places.percentage].filter(
    (value): value is number => value !== null,
  );
  return values.length > 0 ? Math.max(...values) : null;
}
