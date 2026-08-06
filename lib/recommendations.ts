import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSearchResults, type SearchResult, type TmdbTitleLike } from "@/lib/tmdb";
import { searchPlaces, type PlaceSearchResult } from "@/lib/google-places";
import { getExcludedMovieKeys, getExcludedPlaceIds } from "@/lib/exclusions";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const HISTORY_SAMPLE_LIMIT = 20;
const INFERRED_GENRE_LIMIT = 3;

/**
 * The one recommendation engine behind both the full Inspiration page and
 * the compact suggestion strips under a user's own Empfohlen-list / Orte-
 * region list -- each surface calls one of these instead of rolling its own
 * feed logic, so "friends first, then generic" and "exclude anything
 * already interacted with" only exist in one place (lib/exclusions.ts).
 */

async function getFollowedIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("user_follows")
    .select("followed_id")
    .eq("follower_id", userId);
  return (data ?? []).map((row) => row.followed_id);
}

/** Filter chip "Likes meiner Freunde": everything the people you follow have liked, that you haven't rated/saved yet. */
export async function getFriendsLikedMovies(
  supabase: SupabaseClient,
  userId: string,
  apiKey: string,
): Promise<SearchResult[]> {
  const followedIds = await getFollowedIds(supabase, userId);
  if (followedIds.length === 0) return [];

  const [{ data: likedRows }, excludedKeys] = await Promise.all([
    supabase
      .from("item_interactions")
      .select("item_id, media_type")
      .in("user_id", followedIds)
      .eq("interaction_type", "like")
      .in("media_type", ["movie", "tv"]),
    getExcludedMovieKeys(supabase, userId),
  ]);

  const seen = new Set<string>();
  const items: TmdbTitleLike[] = [];
  for (const row of likedRows ?? []) {
    const key = `${row.media_type}-${row.item_id}`;
    const tmdbId = Number(row.item_id);
    if (seen.has(key) || excludedKeys.has(key) || !Number.isFinite(tmdbId)) continue;
    seen.add(key);
    items.push({ id: tmdbId, media_type: row.media_type as "movie" | "tv", poster_path: null });
  }

  return buildSearchResults(items, apiKey);
}

async function inferTopGenreIds(
  supabase: SupabaseClient,
  userId: string,
  apiKey: string,
): Promise<string[]> {
  const [{ data: topListRows }, { data: likedRows }] = await Promise.all([
    supabase.from("top_list").select("item_id, media_type").eq("user_id", userId),
    supabase
      .from("item_interactions")
      .select("item_id, media_type")
      .eq("user_id", userId)
      .eq("interaction_type", "like")
      .in("media_type", ["movie", "tv"]),
  ]);

  const sample = [...(topListRows ?? []), ...(likedRows ?? [])].slice(0, HISTORY_SAMPLE_LIMIT);
  if (sample.length === 0) return [];

  const genreCounts = new Map<number, number>();
  await Promise.all(
    sample.map(async (item) => {
      const mediaType = item.media_type;
      const tmdbId = Number(item.item_id);
      if ((mediaType !== "movie" && mediaType !== "tv") || !Number.isFinite(tmdbId)) return;
      try {
        const url = new URL(`${TMDB_BASE_URL}/${mediaType}/${tmdbId}`);
        url.searchParams.set("api_key", apiKey);
        const response = await fetch(url, { headers: { Accept: "application/json" } });
        if (!response.ok) return;
        const data: { genres?: { id: number }[] } = await response.json();
        for (const genre of data.genres ?? []) {
          genreCounts.set(genre.id, (genreCounts.get(genre.id) ?? 0) + 1);
        }
      } catch {
        // ignore individual lookup failures
      }
    }),
  );

  return Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, INFERRED_GENRE_LIMIT)
    .map(([id]) => String(id));
}

/** Compact widget under the owner's own Empfohlen-list: matches their inferred genre profile. */
export async function getGenreProfileMovieRecommendations(
  supabase: SupabaseClient,
  userId: string,
  apiKey: string,
  limit = 10,
): Promise<SearchResult[]> {
  const [genreIds, excludedKeys] = await Promise.all([
    inferTopGenreIds(supabase, userId, apiKey),
    getExcludedMovieKeys(supabase, userId),
  ]);
  if (genreIds.length === 0) return [];

  const url = new URL(`${TMDB_BASE_URL}/discover/movie`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("sort_by", "popularity.desc");
  url.searchParams.set("with_genres", genreIds.join("|"));

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return [];
    const data: { results: TmdbTitleLike[] } = await response.json();
    const filtered = data.results
      .map((item) => ({ ...item, media_type: "movie" as const }))
      .filter((item) => !excludedKeys.has(`movie-${item.id}`))
      .slice(0, limit);
    return buildSearchResults(filtered, apiKey);
  } catch {
    return [];
  }
}

/**
 * Absolute last-resort fallback for a genuinely cold account: no rating
 * history to infer a genre profile from, no followed friends, nothing.
 * Global TMDB trending, filtered against whatever the viewer has already
 * decided on -- same source /api/trending already exposes standalone, just
 * reusable directly from the discovery engine's exploration tier so a
 * brand-new signup's "Für Dich" is never a dead, empty page.
 */
export async function getTrendingMovies(
  supabase: SupabaseClient,
  userId: string,
  apiKey: string,
  limit = 10,
): Promise<SearchResult[]> {
  const [excludedKeys, response] = await Promise.all([
    getExcludedMovieKeys(supabase, userId),
    fetch(`${TMDB_BASE_URL}/trending/all/week?api_key=${apiKey}`, {
      headers: { Accept: "application/json" },
    }),
  ]);
  if (!response.ok) return [];

  const data: { results: TmdbTitleLike[] } = await response.json();
  const filtered = data.results
    .filter((item) => !excludedKeys.has(`${item.media_type}-${item.id}`))
    .slice(0, limit);
  return buildSearchResults(filtered, apiKey);
}

const CLASSIC_MIN_VOTE_AVERAGE = 7.5;
const CLASSIC_MIN_VOTE_COUNT = 1000;
const CLASSIC_MAX_RELEASE_YEAR_OFFSET = 15;

/** "Klassiker" tile in My Taste's Quick Swipe -- highly-rated movies released more than 15 years ago. */
export async function getClassicMovies(
  supabase: SupabaseClient,
  userId: string,
  apiKey: string,
  limit = 10,
): Promise<SearchResult[]> {
  const cutoffYear = new Date().getFullYear() - CLASSIC_MAX_RELEASE_YEAR_OFFSET;
  const [excludedKeys, response] = await Promise.all([
    getExcludedMovieKeys(supabase, userId),
    fetch(
      `${TMDB_BASE_URL}/discover/movie?api_key=${apiKey}&sort_by=vote_average.desc` +
        `&vote_average.gte=${CLASSIC_MIN_VOTE_AVERAGE}&vote_count.gte=${CLASSIC_MIN_VOTE_COUNT}` +
        `&primary_release_date.lte=${cutoffYear}-12-31&include_adult=false`,
      { headers: { Accept: "application/json" } },
    ),
  ]);
  if (!response.ok) return [];

  const data: { results: TmdbTitleLike[] } = await response.json();
  const filtered = data.results
    .map((item) => ({ ...item, media_type: "movie" as const }))
    .filter((item) => !excludedKeys.has(`movie-${item.id}`))
    .slice(0, limit);
  return buildSearchResults(filtered, apiKey);
}

/** "Bald erscheinend" tile in My Taste's Quick Swipe -- upcoming theatrical releases. */
export async function getUpcomingMovies(
  supabase: SupabaseClient,
  userId: string,
  apiKey: string,
  limit = 10,
): Promise<SearchResult[]> {
  const [excludedKeys, response] = await Promise.all([
    getExcludedMovieKeys(supabase, userId),
    fetch(`${TMDB_BASE_URL}/movie/upcoming?api_key=${apiKey}&region=DE`, {
      headers: { Accept: "application/json" },
    }),
  ]);
  if (!response.ok) return [];

  const data: { results: TmdbTitleLike[] } = await response.json();
  const filtered = data.results
    .map((item) => ({ ...item, media_type: "movie" as const }))
    .filter((item) => !excludedKeys.has(`movie-${item.id}`))
    .slice(0, limit);
  return buildSearchResults(filtered, apiKey);
}

export type CityPlaceRecommendations = {
  fromFriends: { place: PlaceSearchResult; recommendedBy: string[] }[];
  generic: PlaceSearchResult[];
};

/**
 * Same query for the Inspiration Orte tab's per-city feed AND the compact
 * widget under a user's own region list: friends who already added
 * something in this city surface first, then generic popular places fill
 * the rest. `userId` is null for guests -- the app is browsable without an
 * account, just without the "friends" half (there's no follow graph to draw
 * on without an identity), so guests still get the generic listing.
 */
export async function getCityPlaceRecommendations(
  supabase: SupabaseClient,
  userId: string | null,
  city: string,
  apiKey: string,
  limit = 12,
): Promise<CityPlaceRecommendations> {
  const followedIds = userId ? await getFollowedIds(supabase, userId) : [];

  const [excludedPlaceIds, { data: regionRows }] = await Promise.all([
    userId ? getExcludedPlaceIds(supabase, userId) : Promise.resolve(new Set<string>()),
    followedIds.length > 0
      ? supabase
          .from("place_regions")
          .select("id, user_id")
          .in("user_id", followedIds)
          .ilike("region_name", city)
      : Promise.resolve({ data: [] as { id: string; user_id: string }[] }),
  ]);

  const regionIds = (regionRows ?? []).map((row) => row.id);

  let fromFriends: CityPlaceRecommendations["fromFriends"] = [];
  if (regionIds.length > 0) {
    const { data: friendPlaceRows } = await supabase
      .from("places")
      .select(
        "google_place_id, name, address, lat, lng, places_category, photo_url, google_maps_uri, rating, user_rating_count, price_level, phone_number, website_uri, region_id, user_id",
      )
      .in("region_id", regionIds);

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", followedIds);
    const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));

    const byPlaceId = new Map<string, { place: PlaceSearchResult; recommendedBy: string[] }>();
    for (const row of friendPlaceRows ?? []) {
      if (excludedPlaceIds.has(row.google_place_id)) continue;
      const username = usernameById.get(row.user_id);
      if (!username) continue;
      const existing = byPlaceId.get(row.google_place_id);
      if (existing) {
        existing.recommendedBy.push(username);
        continue;
      }
      byPlaceId.set(row.google_place_id, {
        place: {
          placeId: row.google_place_id,
          name: row.name,
          address: row.address,
          lat: row.lat,
          lng: row.lng,
          types: [],
          category: row.places_category,
          photoUrl: row.photo_url,
          googleMapsUri: row.google_maps_uri,
          rating: row.rating,
          userRatingCount: row.user_rating_count,
          priceLevel: row.price_level,
          phoneNumber: row.phone_number,
          websiteUri: row.website_uri,
          openingStatus: null,
          openingPeriods: null,
          utcOffsetMinutes: null,
        },
        recommendedBy: [username],
      });
    }
    fromFriends = Array.from(byPlaceId.values());
  }

  const remaining = Math.max(0, limit - fromFriends.length);
  let generic: PlaceSearchResult[] = [];
  if (remaining > 0) {
    const friendPlaceIds = new Set(fromFriends.map((entry) => entry.place.placeId));
    const isNew = (place: PlaceSearchResult) =>
      !excludedPlaceIds.has(place.placeId) && !friendPlaceIds.has(place.placeId);

    // ~80% restaurants/bars, ~20% sightseeing -- two separate searches
    // mixed by quota, rather than one generic "sights" query dominating
    // (Google's text search otherwise skews heavily toward landmarks).
    const restaurantQuota = Math.round(remaining * 0.8);
    const sightseeingQuota = remaining - restaurantQuota;

    const [restaurantResults, sightResults] = await Promise.all([
      searchPlaces(`Beliebte Restaurants und Bars in ${city}`, apiKey),
      searchPlaces(`Beliebte Sehenswürdigkeiten in ${city}`, apiKey),
    ]);

    const restaurants = restaurantResults
      .filter(isNew)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, restaurantQuota);
    const usedIds = new Set(restaurants.map((place) => place.placeId));
    const sights = sightResults
      .filter((place) => isNew(place) && !usedIds.has(place.placeId))
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, sightseeingQuota);

    generic = [...restaurants, ...sights];
  }

  return { fromFriends, generic };
}
