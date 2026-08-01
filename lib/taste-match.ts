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

function buildCategoryMatch(sharedCount: number, matchCount: number): CategoryTasteMatch {
  return {
    sharedCount,
    matchCount,
    percentage: sharedCount >= TASTE_MATCH_MIN_SHARED ? Math.round((matchCount / sharedCount) * 100) : null,
    isLowConfidence: sharedCount >= TASTE_MATCH_MIN_SHARED && sharedCount <= TASTE_MATCH_LOW_CONFIDENCE_MAX,
  };
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

  let movieShared = 0;
  let movieMatch = 0;
  let placeShared = 0;
  let placeMatch = 0;

  for (const row of viewerRows ?? []) {
    const key = `${row.media_type}-${row.item_id}`;
    const ownerType = ownerByKey.get(key);
    if (!ownerType) continue;

    const isMatch = ownerType === row.interaction_type;
    if (row.media_type === "place") {
      placeShared += 1;
      if (isMatch) placeMatch += 1;
    } else {
      movieShared += 1;
      if (isMatch) movieMatch += 1;
    }
  }

  return {
    movies: buildCategoryMatch(movieShared, movieMatch),
    places: buildCategoryMatch(placeShared, placeMatch),
  };
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
