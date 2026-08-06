import type { SupabaseClient } from "@supabase/supabase-js";
import { inferTopGenreIds } from "@/lib/recommendations";
import { GENRE_FILTERS } from "@/lib/movie-genres";
import { isPlaceCategory, type PlaceCategory } from "@/lib/places";

const MIN_REGION_ITEM_COUNT = 2;
const MAX_PERSONAL_REGIONS = 2;

export type TasteContext = {
  /** TMDB genre ids the user's own likes/Empfohlen-Liste skew toward, most-frequent first. Empty for a cold account. */
  topGenreIds: string[];
  /** Same genres as human-readable labels ("Thriller"), for reason text. */
  topGenreLabels: string[];
  /** The user's own saved-places regions with at least MIN_REGION_ITEM_COUNT items, most-populated first -- independent of home_city (e.g. a holiday region like "Bali"). */
  topRegions: { name: string; itemCount: number; restaurantHeavy: boolean }[];
  /** Place categories the user has saved at least once, for "explore something new" personalization. */
  seenPlaceCategories: Set<PlaceCategory>;
  /** Total movie/tv "Gefällt mir" count -- the confidence check before a genre-based motivation message is allowed to claim anything. */
  movieLikeCount: number;
};

/**
 * Gathers everything Quick-Swipe's mixer (lib/quick-swipe.ts) needs to make
 * candidates "sichtbar auf den bereits gespeicherten eigenen Listen
 * aufbauen" instead of a purely global shuffle -- own genre profile (reuses
 * the same inference lib/recommendations.ts's genre-profile widget already
 * uses) plus own saved-places regions/categories. One round-trip per
 * source, reused across all 6 mix groups in a single call per request.
 */
export async function getTasteContext(
  supabase: SupabaseClient,
  userId: string,
  tmdbApiKey: string | undefined,
): Promise<TasteContext> {
  const [topGenreIds, { data: regionRows }, { data: placeRows }, { count: movieLikeCount }] = await Promise.all([
    tmdbApiKey ? inferTopGenreIds(supabase, userId, tmdbApiKey) : Promise.resolve([]),
    supabase.from("place_regions").select("id, region_name").eq("user_id", userId),
    supabase.from("places").select("region_id, places_category").eq("user_id", userId),
    supabase
      .from("item_interactions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("interaction_type", "like")
      .in("media_type", ["movie", "tv"]),
  ]);

  const genreLabelById = new Map(GENRE_FILTERS.map((genre) => [genre.id, genre.label]));
  const topGenreLabels = topGenreIds.map((id) => genreLabelById.get(id)).filter((v): v is string => !!v);

  const itemCountByRegionId = new Map<string, number>();
  const restaurantCountByRegionId = new Map<string, number>();
  const seenPlaceCategories = new Set<PlaceCategory>();
  for (const row of placeRows ?? []) {
    itemCountByRegionId.set(row.region_id, (itemCountByRegionId.get(row.region_id) ?? 0) + 1);
    if (row.places_category === "restaurant") {
      restaurantCountByRegionId.set(row.region_id, (restaurantCountByRegionId.get(row.region_id) ?? 0) + 1);
    }
    if (isPlaceCategory(row.places_category)) seenPlaceCategories.add(row.places_category);
  }

  const topRegions = (regionRows ?? [])
    .map((region) => {
      const itemCount = itemCountByRegionId.get(region.id) ?? 0;
      const restaurantCount = restaurantCountByRegionId.get(region.id) ?? 0;
      return { name: region.region_name, itemCount, restaurantHeavy: restaurantCount / Math.max(1, itemCount) >= 0.5 };
    })
    .filter((region) => region.itemCount >= MIN_REGION_ITEM_COUNT)
    .sort((a, b) => b.itemCount - a.itemCount)
    .slice(0, MAX_PERSONAL_REGIONS);

  return { topGenreIds, topGenreLabels, topRegions, seenPlaceCategories, movieLikeCount: movieLikeCount ?? 0 };
}
