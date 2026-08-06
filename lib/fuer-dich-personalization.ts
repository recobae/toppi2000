import type { SupabaseClient } from "@supabase/supabase-js";
import { getTasteContext } from "@/lib/quick-swipe-context";
import { getGenreMatchedMovies } from "@/lib/quick-swipe";
import { getCityPlaceRecommendations, getTrendingMovies } from "@/lib/recommendations";
import { getExcludedMovieKeys } from "@/lib/exclusions";
import { placeSearchResultToCandidate, type DiscoveryCandidate } from "@/lib/discovery";
import type { SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";
const REGION_CLUSTER_THRESHOLD = 3;
const GENRE_LIKE_THRESHOLD = 3;
const SUGGESTION_LIMIT = 8;

function movieCandidate(item: SearchResult, reason: string): DiscoveryCandidate {
  return {
    id: `movie-${item.mediaType}-${item.id}`,
    title: item.title,
    category: item.mediaType === "tv" ? "Serie" : "Film",
    location: null,
    imageUrl: item.posterPath ? `${POSTER_BASE_URL}${item.posterPath}` : null,
    sourceType: item.mediaType,
    sourceUserId: null,
    sourceUsernames: [],
    note: null,
    rating: item.movieDetails.voteAverage,
    socialSupportCount: 0,
    personalSupportCount: 0,
    lastActivityAt: new Date().toISOString(),
    promptMatchScore: 0.5,
    finalScore: 0,
    reason,
    ref: { mediaType: item.mediaType, tmdbId: item.id, movieYear: item.year, movieDetails: item.movieDetails, watchProviders: item.watchProviders },
  };
}

export type PersonalDiscoveryHighlight = {
  /** Which of the 4 priorities fired -- for diagnostics/analytics, not shown to the user. */
  priority: "region_cluster" | "home_city" | "genre_pattern" | "exploration";
  message: string;
  candidates: DiscoveryCandidate[];
};

/**
 * Für Dich's "Persönliche Entdeckung" block -- exactly ONE primary,
 * data-backed context impulse (never several competing ones at once), in
 * strict priority order. Reuses lib/quick-swipe-context.ts's already-built
 * taste inference (own regions/genres) -- the same logic that used to drive
 * My Taste's on-screen motivation line, now living here instead (Structural
 * round: My Taste stays untouched otherwise, this moved wholesale).
 */
export async function getPersonalDiscoveryHighlight(
  supabase: SupabaseClient,
  userId: string,
  params: { homeCity: string | null; tmdbApiKey?: string; placesApiKey?: string },
): Promise<PersonalDiscoveryHighlight | null> {
  const context = await getTasteContext(supabase, userId, params.tmdbApiKey);

  // Priority 1: an own place cluster (>= 3 items) in one region, independent of home_city.
  const topRegion = context.topRegions.find((region) => region.itemCount >= REGION_CLUSTER_THRESHOLD);
  if (topRegion && params.placesApiKey) {
    const { generic } = await getCityPlaceRecommendations(supabase, userId, topRegion.name, params.placesApiKey, SUGGESTION_LIMIT);
    const candidates = generic.map((place) => placeSearchResultToCandidate(place, topRegion.name, []));
    if (candidates.length > 0) {
      return {
        priority: "region_cluster",
        message: `Du hast bereits ${topRegion.itemCount} Orte in ${topRegion.name} gesammelt — entdecke mehr.`,
        candidates,
      };
    }
  }

  // Priority 2: no strong cluster, but a home_city is set in Settings.
  if (params.homeCity && params.placesApiKey) {
    const { generic } = await getCityPlaceRecommendations(supabase, userId, params.homeCity, params.placesApiKey, SUGGESTION_LIMIT);
    const candidates = generic.map((place) => placeSearchResultToCandidate(place, params.homeCity as string, []));
    if (candidates.length > 0) {
      return {
        priority: "home_city",
        message: `Entdecke weitere Empfehlungen für ${params.homeCity}.`,
        candidates,
      };
    }
  }

  // Priority 3: a clear movie/tv genre pattern in the viewer's own likes.
  const topGenre = context.topGenreLabels[0];
  if (topGenre && context.movieLikeCount >= GENRE_LIKE_THRESHOLD && params.tmdbApiKey) {
    const excludedKeys = await getExcludedMovieKeys(supabase, userId);
    const items = await getGenreMatchedMovies(excludedKeys, params.tmdbApiKey, context.topGenreIds, SUGGESTION_LIMIT);
    const candidates = items.map((item) => movieCandidate(item, `Ähnlich zu deinen ${topGenre}n`));
    if (candidates.length > 0) {
      return {
        priority: "genre_pattern",
        message: `Du bewertest gerade viele ${topGenre}-Titel — entdecke weitere passende Filme und Serien.`,
        candidates,
      };
    }
  }

  // Priority 4: no clear cluster anywhere -- a controlled, generic exploration mix.
  if (params.tmdbApiKey) {
    const items = await getTrendingMovies(supabase, userId, params.tmdbApiKey, SUGGESTION_LIMIT);
    const candidates = items.map((item) => movieCandidate(item, "Entdecke etwas Neues"));
    if (candidates.length > 0) {
      return { priority: "exploration", message: "Entdecke etwas Neues nach deinem Geschmack.", candidates };
    }
  }

  return null;
}
