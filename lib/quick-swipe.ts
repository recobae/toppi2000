import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getTrendingMovies,
  getClassicMovies,
  getUpcomingMovies,
  getCityPlaceRecommendations,
} from "@/lib/recommendations";
import { placeSearchResultToCandidate, type DiscoveryCandidate } from "@/lib/discovery";
import type { SearchResult } from "@/lib/tmdb";

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";

function movieToCandidate(item: SearchResult, reason: string): DiscoveryCandidate {
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
    ref: { mediaType: item.mediaType, tmdbId: item.id },
  };
}

export type QuickSwipeUnit =
  | { kind: "single"; candidate: DiscoveryCandidate }
  | { kind: "battle"; a: DiscoveryCandidate; b: DiscoveryCandidate };

// Every ~5th card is a Battle instead of a single decision -- gives the
// queue rhythm without the user ever having to configure anything.
const BATTLE_EVERY = 5;

/**
 * My Taste's Quick-Swipe queue -- the only content source for the "reiner
 * Quick-Swipe-Bereich" (Master-Audit round). Mixes trending/classic/
 * upcoming movies with (when a home_city is set) nearby places, so the
 * queue is varied without the user ever choosing a filter/category/mode.
 * Shuffled per fetch; every ~5th slot becomes a Battle (two same-type
 * candidates shown side by side) instead of a single card.
 */
export async function getQuickSwipeQueue(
  supabase: SupabaseClient,
  userId: string,
  params: {
    excludeIds: Set<string>;
    limit: number;
    homeCity: string | null;
    tmdbApiKey?: string;
    placesApiKey?: string;
  },
): Promise<QuickSwipeUnit[]> {
  const perSource = Math.ceil(params.limit / 3) + 2;
  const candidates: DiscoveryCandidate[] = [];

  if (params.tmdbApiKey) {
    const [trending, classics, upcoming] = await Promise.all([
      getTrendingMovies(supabase, userId, params.tmdbApiKey, perSource),
      getClassicMovies(supabase, userId, params.tmdbApiKey, perSource),
      getUpcomingMovies(supabase, userId, params.tmdbApiKey, perSource),
    ]);
    for (const item of trending) candidates.push(movieToCandidate(item, "Aktueller Hit"));
    for (const item of classics) candidates.push(movieToCandidate(item, "Klassiker"));
    for (const item of upcoming) candidates.push(movieToCandidate(item, "Bald im Kino"));
  }

  if (params.homeCity && params.placesApiKey) {
    const { generic } = await getCityPlaceRecommendations(
      supabase,
      userId,
      params.homeCity,
      params.placesApiKey,
      perSource,
    );
    for (const place of generic) {
      candidates.push(placeSearchResultToCandidate(place, params.homeCity, []));
    }
  }

  const seen = new Set<string>();
  const pool = candidates.filter((candidate) => {
    if (params.excludeIds.has(candidate.id) || seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });

  // Fisher-Yates -- session freshness matters here, not reproducibility.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const units: QuickSwipeUnit[] = [];
  let i = 0;
  let sinceBattle = 0;
  while (i < pool.length && units.length < params.limit) {
    sinceBattle++;
    if (sinceBattle >= BATTLE_EVERY && i + 1 < pool.length && pool[i].sourceType === pool[i + 1].sourceType) {
      units.push({ kind: "battle", a: pool[i], b: pool[i + 1] });
      i += 2;
      sinceBattle = 0;
    } else {
      units.push({ kind: "single", candidate: pool[i] });
      i += 1;
    }
  }

  return units;
}
