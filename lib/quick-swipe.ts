import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getTrendingMovies,
  getClassicMovies,
  getUpcomingMovies,
  getCityPlaceRecommendations,
} from "@/lib/recommendations";
import { placeSearchResultToCandidate, type DiscoveryCandidate } from "@/lib/discovery";
import { getExcludedMovieKeys, getExcludedPlaceIds } from "@/lib/exclusions";
import { searchPlaces, type PlaceSearchResult } from "@/lib/google-places";
import { buildSearchResults, type SearchResult, type TmdbTitleLike } from "@/lib/tmdb";
import { GENRE_FILTERS } from "@/lib/movie-genres";
import { PLACE_CATEGORIES, PLACE_CATEGORY_LABELS, type PlaceCategory } from "@/lib/places";
import { getTasteContext } from "@/lib/quick-swipe-context";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500";

export type QuickSwipeUnit =
  | { kind: "single"; candidate: DiscoveryCandidate }
  | { kind: "battle"; a: DiscoveryCandidate; b: DiscoveryCandidate };

/** The 5 candidate-source groups plus "battle" -- matches the required 25/20/20/15/10/10 startup weighting exactly (when Battle is enabled, see BATTLE_MODE_ENABLED below). */
export type MixGroup = "high_quality" | "topical" | "home_city" | "battle" | "long_tail" | "exploration";
type ItemMixGroup = Exclude<MixGroup, "battle">;

/**
 * Battle temporarily disabled project-wide: a tap on a Battle side both
 * committed the winner AND advanced the deck in one motion, so there was no
 * way to open either item's detail view or reconsider before the decision
 * landed. Rather than rebuild that interaction now, Battle is switched off
 * here -- no Battle units are produced, no Battle UI is reachable, nothing
 * about the Battle code itself (components/swipe/battle-card.tsx, the
 * battleKey/buildBattles logic below) was deleted. The 15% weight is
 * folded back into the other 5 groups (see BASE_MIX_WEIGHTS/MIX_WEIGHTS)
 * so the mix still sums to 100% without Battle.
 *
 * A future Battle must, before this flag flips back on:
 *  - show both items side by side without instantly deciding on tap,
 *  - let either side's detail view be opened independently,
 *  - have its own explicit, visible "chosen" state,
 *  - only advance the deck after a deliberate confirm, not the first tap.
 */
const BATTLE_MODE_ENABLED = false;

const BASE_MIX_WEIGHTS: Record<ItemMixGroup, number> = {
  high_quality: 0.25,
  topical: 0.2,
  home_city: 0.2,
  long_tail: 0.1,
  exploration: 0.1,
};
const BATTLE_WEIGHT = 0.15;

// With Battle disabled, redistribute its 15% proportionally across the
// other 5 groups instead of just dropping it (leaving the queue 15% short
// of its target length) -- e.g. high_quality's 0.25 becomes 0.25/0.85.
const MIX_WEIGHTS: Record<ItemMixGroup, number> = BATTLE_MODE_ENABLED
  ? BASE_MIX_WEIGHTS
  : (Object.fromEntries(
      Object.entries(BASE_MIX_WEIGHTS).map(([group, weight]) => [group, weight / (1 - BATTLE_WEIGHT)]),
    ) as Record<ItemMixGroup, number>);

// How much extra each group fetches beyond its own target -- gives battle-
// pairing and the shortfall-redistribution pass real material to draw from
// instead of only ever seeing exactly-sized pools.
const OVERFETCH_SLACK = 6;

export type QuickSwipeMixDebug = Record<MixGroup, number>;

function movieToCandidate(item: SearchResult, reason: string, mixGroup: ItemMixGroup): DiscoveryCandidate {
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
    mixGroup,
    ref: {
      mediaType: item.mediaType,
      tmdbId: item.id,
      movieYear: item.year,
      movieDetails: item.movieDetails,
      watchProviders: item.watchProviders,
    },
  };
}

function placeToCandidate(
  place: PlaceSearchResult,
  city: string,
  mixGroup: ItemMixGroup,
  reasonOverride?: string,
): DiscoveryCandidate {
  const candidate = placeSearchResultToCandidate(place, city, []);
  candidate.mixGroup = mixGroup;
  if (reasonOverride) candidate.reason = reasonOverride;
  return candidate;
}

async function fetchTmdbDiscover(url: string): Promise<TmdbTitleLike[]> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return [];
    const data: { results: TmdbTitleLike[] } = await response.json();
    return data.results.map((item) => ({ ...item, media_type: "movie" as const }));
  } catch {
    return [];
  }
}

/** "Ähnlich zu deinem Geschmack" -- movies matching the taste-context's already-inferred top genres, no second genre-inference pass. */
async function getGenreMatchedMovies(
  excludedKeys: Set<string>,
  apiKey: string,
  genreIds: string[],
  limit: number,
): Promise<SearchResult[]> {
  if (genreIds.length === 0) return [];
  const results = await fetchTmdbDiscover(
    `${TMDB_BASE_URL}/discover/movie?api_key=${apiKey}&include_adult=false&sort_by=popularity.desc&with_genres=${genreIds.join("|")}`,
  );
  const filtered = results.filter((item) => !excludedKeys.has(`movie-${item.id}`)).slice(0, limit);
  return buildSearchResults(filtered, apiKey);
}

const LONGTAIL_MIN_VOTE_AVERAGE = 7;
const LONGTAIL_MIN_VOTE_COUNT = 50;
const LONGTAIL_MAX_VOTE_COUNT = 500;

/** "Geheimtipp" -- decently-rated movies TMDB's own vote_count shows are far less mainstream than trending/classics. */
async function getLongTailMovies(excludedKeys: Set<string>, apiKey: string, limit: number): Promise<SearchResult[]> {
  const results = await fetchTmdbDiscover(
    `${TMDB_BASE_URL}/discover/movie?api_key=${apiKey}&include_adult=false&sort_by=vote_average.desc` +
      `&vote_average.gte=${LONGTAIL_MIN_VOTE_AVERAGE}&vote_count.gte=${LONGTAIL_MIN_VOTE_COUNT}&vote_count.lte=${LONGTAIL_MAX_VOTE_COUNT}`,
  );
  const filtered = results.filter((item) => !excludedKeys.has(`movie-${item.id}`)).slice(0, limit);
  return buildSearchResults(filtered, apiKey);
}

/** "Systematisch explorativ" -- a genre outside the user's own top set, so Quick-Swipe occasionally steps outside the existing profile on purpose. */
async function getExplorationMovies(
  excludedKeys: Set<string>,
  apiKey: string,
  ownGenreIds: string[],
  limit: number,
): Promise<{ items: SearchResult[]; genreLabel: string | null }> {
  const unexplored = GENRE_FILTERS.filter((genre) => !ownGenreIds.includes(genre.id));
  const pickFrom = unexplored.length > 0 ? unexplored : GENRE_FILTERS;
  const genre = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  const results = await fetchTmdbDiscover(
    `${TMDB_BASE_URL}/discover/movie?api_key=${apiKey}&include_adult=false&sort_by=popularity.desc&with_genres=${genre.id}`,
  );
  const filtered = results.filter((item) => !excludedKeys.has(`movie-${item.id}`)).slice(0, limit);
  return { items: await buildSearchResults(filtered, apiKey), genreLabel: unexplored.length > 0 ? genre.label : null };
}

/** "Geheimtipp" places -- an explicit low-profile search instead of the same popularity-sorted query every other tier uses. */
async function getLongTailPlaces(
  excludedPlaceIds: Set<string>,
  alreadyUsedIds: Set<string>,
  city: string,
  apiKey: string,
  limit: number,
): Promise<PlaceSearchResult[]> {
  const results = await searchPlaces(`Geheimtipps und wenig bekannte Orte in ${city}`, apiKey);
  return results.filter((place) => !excludedPlaceIds.has(place.placeId) && !alreadyUsedIds.has(place.placeId)).slice(0, limit);
}

/** A place category the user has never saved -- deliberately outside their existing profile. */
async function getExplorationPlaces(
  excludedPlaceIds: Set<string>,
  alreadyUsedIds: Set<string>,
  city: string,
  apiKey: string,
  seenCategories: Set<PlaceCategory>,
  limit: number,
): Promise<{ results: PlaceSearchResult[]; category: PlaceCategory | null }> {
  const unseen = PLACE_CATEGORIES.filter((category) => category !== "other" && !seenCategories.has(category));
  if (unseen.length === 0) return { results: [], category: null };
  const category = unseen[Math.floor(Math.random() * unseen.length)];
  const results = await searchPlaces(`${PLACE_CATEGORY_LABELS[category]} in ${city}`, apiKey);
  return {
    results: results.filter((place) => !excludedPlaceIds.has(place.placeId) && !alreadyUsedIds.has(place.placeId)).slice(0, limit),
    category,
  };
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** Same media type + a shared primary genre (movies/tv), or same category (places) -- the only comparisons the Battle rule allows. */
function battleKey(candidate: DiscoveryCandidate): string | null {
  if (candidate.sourceType === "movie" || candidate.sourceType === "tv") {
    const genre = candidate.ref.movieDetails?.genres?.[0];
    return genre ? `${candidate.sourceType}:${genre}` : null;
  }
  if (candidate.sourceType === "place" && candidate.ref.placeCategory) {
    return `place:${candidate.ref.placeCategory}`;
  }
  return null;
}

/**
 * Pulls genre/category-matched pairs straight out of the item pools (before
 * the single-target fill below) -- never invents an abstract battle without
 * two real, save-able items on both sides.
 */
function buildBattles(
  pools: Record<ItemMixGroup, DiscoveryCandidate[]>,
  targetCount: number,
): { kind: "battle"; a: DiscoveryCandidate; b: DiscoveryCandidate }[] {
  if (!BATTLE_MODE_ENABLED || targetCount <= 0) return [];
  const groups = Object.keys(pools) as ItemMixGroup[];
  const buckets = new Map<string, DiscoveryCandidate[]>();
  for (const group of groups) {
    for (const candidate of pools[group]) {
      const key = battleKey(candidate);
      if (!key) continue;
      const bucket = buckets.get(key) ?? [];
      bucket.push(candidate);
      buckets.set(key, bucket);
    }
  }

  const used = new Set<string>();
  const battles: { kind: "battle"; a: DiscoveryCandidate; b: DiscoveryCandidate }[] = [];
  for (const bucket of buckets.values()) {
    shuffle(bucket);
    while (bucket.length >= 2 && battles.length < targetCount) {
      const a = bucket.pop()!;
      const b = bucket.pop()!;
      used.add(a.id);
      used.add(b.id);
      battles.push({ kind: "battle", a, b });
    }
    if (battles.length >= targetCount) break;
  }

  for (const group of groups) {
    pools[group] = pools[group].filter((candidate) => !used.has(candidate.id));
  }

  return battles;
}

/**
 * Assigns each group its target slice, then redistributes any shortfall
 * (a group with too few real candidates) to whichever groups still have
 * surplus -- never forces a category that has nothing to offer, but still
 * fills the queue up to the requested length whenever the pools allow it.
 */
function fillSingleTargets(
  pools: Record<ItemMixGroup, DiscoveryCandidate[]>,
  targets: Record<ItemMixGroup, number>,
  totalNeeded: number,
): { singles: DiscoveryCandidate[]; mixDebug: Record<ItemMixGroup, number> } {
  const groups = Object.keys(pools) as ItemMixGroup[];
  const taken: Record<ItemMixGroup, DiscoveryCandidate[]> = {
    high_quality: [],
    topical: [],
    home_city: [],
    long_tail: [],
    exploration: [],
  };
  let assigned = 0;
  for (const group of groups) {
    const take = Math.min(targets[group], pools[group].length);
    taken[group] = pools[group].slice(0, take);
    assigned += take;
  }

  let remaining = Math.max(0, totalNeeded - assigned);
  let progress = true;
  while (remaining > 0 && progress) {
    progress = false;
    for (const group of groups) {
      if (remaining <= 0) break;
      const already = taken[group].length;
      if (already < pools[group].length) {
        taken[group].push(pools[group][already]);
        remaining--;
        progress = true;
      }
    }
  }

  const mixDebug = Object.fromEntries(groups.map((group) => [group, taken[group].length])) as Record<
    ItemMixGroup,
    number
  >;
  return { singles: groups.flatMap((group) => taken[group]), mixDebug };
}

/** Round-robins across groups (so the feed doesn't run in same-source blocks) and spaces battle units evenly through the result instead of clustering them. */
function interleave(
  singles: DiscoveryCandidate[],
  battles: { kind: "battle"; a: DiscoveryCandidate; b: DiscoveryCandidate }[],
): QuickSwipeUnit[] {
  const byGroup = new Map<string, DiscoveryCandidate[]>();
  for (const candidate of singles) {
    const key = candidate.mixGroup ?? "unknown";
    const list = byGroup.get(key) ?? [];
    list.push(candidate);
    byGroup.set(key, list);
  }
  for (const list of byGroup.values()) shuffle(list);

  const groupKeys = [...byGroup.keys()];
  const singleUnits: QuickSwipeUnit[] = [];
  let remaining = singles.length;
  while (remaining > 0) {
    for (const key of groupKeys) {
      const list = byGroup.get(key)!;
      if (list.length === 0) continue;
      singleUnits.push({ kind: "single", candidate: list.shift()! });
      remaining--;
    }
  }

  if (battles.length === 0) return singleUnits;

  const step = Math.max(1, Math.floor((singleUnits.length + battles.length) / (battles.length + 1)));
  const result: QuickSwipeUnit[] = [];
  let battleIndex = 0;
  for (let i = 0; i < singleUnits.length; i++) {
    result.push(singleUnits[i]);
    if (battleIndex < battles.length && (i + 1) % step === 0) {
      result.push(battles[battleIndex]);
      battleIndex++;
    }
  }
  while (battleIndex < battles.length) {
    result.push(battles[battleIndex]);
    battleIndex++;
  }
  return result;
}

/**
 * My Taste's Quick-Swipe queue. Builds 5 candidate-source groups (weighted
 * 25/20/20/10/10) plus genre/category-matched Battles (15%), each group
 * grounded in the user's own saved lists/genres/regions where that data
 * exists (lib/quick-swipe-context.ts) rather than a purely global shuffle.
 * Groups that genuinely have nothing to offer (no home_city, no genre
 * history, an already-fully-explored place-category set) are skipped, not
 * padded with irrelevant filler -- fillSingleTargets then redistributes
 * their share to groups that do have material.
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
): Promise<{ units: QuickSwipeUnit[]; mixDebug: QuickSwipeMixDebug }> {
  const context = await getTasteContext(supabase, userId, params.tmdbApiKey);

  const targets: Record<ItemMixGroup, number> = {
    high_quality: Math.round(params.limit * MIX_WEIGHTS.high_quality),
    topical: Math.round(params.limit * MIX_WEIGHTS.topical),
    home_city: Math.round(params.limit * MIX_WEIGHTS.home_city),
    long_tail: Math.round(params.limit * MIX_WEIGHTS.long_tail),
    exploration: Math.round(params.limit * MIX_WEIGHTS.exploration),
  };
  const targetBattle = BATTLE_MODE_ENABLED ? Math.round(params.limit * BATTLE_WEIGHT) : 0;
  const fetchN = (target: number) => target + OVERFETCH_SLACK;

  const pools: Record<ItemMixGroup, DiscoveryCandidate[]> = {
    high_quality: [],
    topical: [],
    home_city: [],
    long_tail: [],
    exploration: [],
  };

  const excludedMovieKeys = params.tmdbApiKey ? await getExcludedMovieKeys(supabase, userId) : new Set<string>();
  const excludedPlaceIds = params.placesApiKey ? await getExcludedPlaceIds(supabase, userId) : new Set<string>();

  // --- high_quality: trending + classics + genre-matched (if the user has taste history) ---
  if (params.tmdbApiKey) {
    const apiKey = params.tmdbApiKey;
    const perSource = Math.ceil(fetchN(targets.high_quality) / (context.topGenreIds.length > 0 ? 3 : 2));
    const [trending, classics, genreMatched] = await Promise.all([
      getTrendingMovies(supabase, userId, apiKey, perSource),
      getClassicMovies(supabase, userId, apiKey, perSource),
      getGenreMatchedMovies(excludedMovieKeys, apiKey, context.topGenreIds, perSource),
    ]);
    for (const item of trending) pools.high_quality.push(movieToCandidate(item, "Aktueller Hit", "high_quality"));
    for (const item of classics) pools.high_quality.push(movieToCandidate(item, "Beliebter Klassiker", "high_quality"));
    const genreLabel = context.topGenreLabels[0];
    for (const item of genreMatched) {
      pools.high_quality.push(
        movieToCandidate(item, genreLabel ? `Ähnlich zu deinen ${genreLabel}n` : "Passt zu deinem Geschmack", "high_quality"),
      );
    }
  }

  // --- topical: upcoming releases ---
  if (params.tmdbApiKey) {
    const upcoming = await getUpcomingMovies(supabase, userId, params.tmdbApiKey, fetchN(targets.topical));
    for (const item of upcoming) pools.topical.push(movieToCandidate(item, "Bald im Kino", "topical"));
  }

  // --- home_city: home-city generic places + the user's own extra saved regions (e.g. a holiday region beyond home_city) ---
  if (params.placesApiKey) {
    const apiKey = params.placesApiKey;
    const cities = [
      ...(params.homeCity ? [{ name: params.homeCity, personal: null as "restaurant" | "region" | null }] : []),
      ...context.topRegions
        .filter((region) => region.name !== params.homeCity)
        .map((region) => ({
          name: region.name,
          personal: (region.restaurantHeavy ? "restaurant" : "region") as "restaurant" | "region",
        })),
    ];
    if (cities.length > 0) {
      const perCity = Math.ceil(fetchN(targets.home_city) / cities.length);
      const results = await Promise.all(
        cities.map(async (city) => ({
          city,
          generic: (await getCityPlaceRecommendations(supabase, userId, city.name, apiKey, perCity)).generic,
        })),
      );
      for (const { city, generic } of results) {
        const reason =
          city.personal === "restaurant"
            ? `Ähnliches Restaurant in ${city.name}`
            : city.personal === "region"
              ? `Weitere Ideen für ${city.name}`
              : undefined;
        for (const place of generic) pools.home_city.push(placeToCandidate(place, city.name, "home_city", reason));
      }
    }
  }

  // --- long_tail: niche movies + under-the-radar places ---
  if (params.tmdbApiKey) {
    const longTailMovies = await getLongTailMovies(excludedMovieKeys, params.tmdbApiKey, Math.ceil(fetchN(targets.long_tail) / 2));
    for (const item of longTailMovies) pools.long_tail.push(movieToCandidate(item, "Geheimtipp", "long_tail"));
  }
  const longTailCity = params.homeCity ?? context.topRegions[0]?.name ?? null;
  if (params.placesApiKey && longTailCity) {
    const alreadyUsed = new Set(pools.home_city.map((c) => c.ref.placeId).filter((id): id is string => !!id));
    const longTailPlaces = await getLongTailPlaces(
      excludedPlaceIds,
      alreadyUsed,
      longTailCity,
      params.placesApiKey,
      Math.ceil(fetchN(targets.long_tail) / 2),
    );
    for (const place of longTailPlaces) pools.long_tail.push(placeToCandidate(place, longTailCity, "long_tail", "Geheimtipp"));
  }

  // --- exploration: deliberately outside the user's existing profile ---
  if (params.tmdbApiKey) {
    const { items, genreLabel } = await getExplorationMovies(
      excludedMovieKeys,
      params.tmdbApiKey,
      context.topGenreIds,
      Math.ceil(fetchN(targets.exploration) / 2),
    );
    for (const item of items) {
      pools.exploration.push(
        movieToCandidate(item, genreLabel ? `Etwas anderes: ${genreLabel}` : "Neu für dich zu entdecken", "exploration"),
      );
    }
  }
  const explorationCity = params.homeCity ?? context.topRegions[0]?.name ?? null;
  if (params.placesApiKey && explorationCity) {
    const alreadyUsed = new Set(
      [...pools.home_city, ...pools.long_tail].map((c) => c.ref.placeId).filter((id): id is string => !!id),
    );
    const { results, category } = await getExplorationPlaces(
      excludedPlaceIds,
      alreadyUsed,
      explorationCity,
      params.placesApiKey,
      context.seenPlaceCategories,
      Math.ceil(fetchN(targets.exploration) / 2),
    );
    for (const place of results) {
      pools.exploration.push(
        placeToCandidate(
          place,
          explorationCity,
          "exploration",
          category ? `Neue Kategorie für dich: ${PLACE_CATEGORY_LABELS[category]}` : "Neu für dich zu entdecken",
        ),
      );
    }
  }

  // --- dedupe across groups + this session's already-seen ids ---
  const seen = new Set<string>();
  for (const group of Object.keys(pools) as ItemMixGroup[]) {
    pools[group] = pools[group].filter((candidate) => {
      if (params.excludeIds.has(candidate.id) || seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    });
  }

  const battles = buildBattles(pools, targetBattle);
  const { singles, mixDebug } = fillSingleTargets(pools, targets, params.limit - battles.length);
  const units = interleave(singles, battles);

  return { units, mixDebug: { ...mixDebug, battle: battles.length } };
}
