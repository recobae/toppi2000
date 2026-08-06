import type { SupabaseClient } from "@supabase/supabase-js";
import { getExcludedMovieKeys, getExcludedPlaceIds } from "@/lib/exclusions";
import { getRecommendationCategory } from "@/lib/recommendation-categories";
import {
  getCityPlaceRecommendations,
  getGenreProfileMovieRecommendations,
  getTrendingMovies,
} from "@/lib/recommendations";
import { PLACE_CATEGORY_LABELS, isPlaceCategory, type PlaceCategory, type PlacePriceLevel } from "@/lib/places";
import type { PlaceSearchResult } from "@/lib/google-places";
import type { SourceType } from "@/lib/topf";
import type { MovieDetails, WatchProviderGroups } from "@/lib/tmdb";
import type { OpeningStatus } from "@/lib/opening-hours";

export type DiscoverySourceType = "movie" | "tv" | "place" | "topf";

export type DiscoveryCandidate = {
  id: string;
  title: string;
  category: string;
  location: string | null;
  imageUrl: string | null;
  sourceType: DiscoverySourceType;
  /** Who this card is most directly attributed to -- null only for the anonymous exploration fallback. */
  sourceUserId: string | null;
  sourceUsernames: string[];
  note: string | null;
  rating: number | null;
  /** Distinct followed friends who independently have this exact item. */
  socialSupportCount: number;
  /** How well this matches the viewer's own taste profile, 0-100 for display. */
  personalSupportCount: number;
  lastActivityAt: string;
  /** Reserved for a future prompt/search input -- neutral until then. */
  promptMatchScore: number;
  finalScore: number;
  /** One short, human line explaining why this card showed up. */
  reason: string;
  /** Quick-Swipe-only diagnostic tag (which of the 6 mix groups produced this candidate) -- undefined outside that surface. */
  mixGroup?: string;
  ref: {
    mediaType?: "movie" | "tv";
    tmdbId?: number;
    /** Pre-fetched detail-view data for movie/tv candidates -- already available at candidate-build time (TMDB SearchResult), avoids a second fetch when the global detail modal opens. */
    movieYear?: string | null;
    movieDetails?: MovieDetails;
    watchProviders?: WatchProviderGroups;
    placeId?: string;
    lat?: number;
    lng?: number;
    regionName?: string;
    placeCategory?: PlaceCategory;
    /** Pre-fetched detail-view data for place candidates -- already available at candidate-build time (Google Places result). */
    placeGoogleMapsUri?: string | null;
    placeUserRatingCount?: number | null;
    placePriceLevel?: PlacePriceLevel | null;
    placePhoneNumber?: string | null;
    placeWebsiteUri?: string | null;
    placeOpeningStatus?: OpeningStatus | null;
    recommendationId?: string;
    recommendationCategoryKey?: string;
    recommendationSourceType?: SourceType;
    recommendationExternalId?: string | null;
    recommendationMetadata?: Record<string, unknown> | null;
  };
};

// Scoring weights (w1..w7 in the product spec) -- sum to 1. No prompt input
// exists yet on this surface, so intentMatch/categoryFit stay neutral
// constants rather than real signals; the other five are all computed from
// real network data below.
const WEIGHT_FRESHNESS = 0.2;
const WEIGHT_PERSONAL_AFFINITY = 0.25;
const WEIGHT_SOCIAL_PROOF = 0.25;
const WEIGHT_REPEAT_VALIDATION = 0.15;
const WEIGHT_EXPLORATION = 0.15;

const FRESHNESS_HALF_LIFE_DAYS = 21;
const SOCIAL_PROOF_CAP = 4;

function freshnessScore(createdAt: string): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp((-Math.LN2 * Math.max(0, ageDays)) / FRESHNESS_HALF_LIFE_DAYS);
}

// Deterministic per-day "novelty" jitter -- same item ranks slightly
// differently from one day to the next without any randomness that would
// make the feed feel unstable within a single visit.
function explorationScore(id: string): number {
  const seed = `${id}-${new Date().toISOString().slice(0, 10)}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function buildReason(params: {
  socialSupportCount: number;
  sourceUsernames: string[];
  personalAffinity: number;
  freshness: number;
  isExploration: boolean;
}): string {
  const { socialSupportCount, sourceUsernames, personalAffinity, freshness, isExploration } = params;
  if (isExploration) return "Neu für dich zu entdecken";
  if (socialSupportCount >= 2) {
    return `${socialSupportCount} aus deinem Netzwerk empfehlen das`;
  }
  if (sourceUsernames.length === 1) {
    return freshness > 0.6 ? `Gerade neu von ${sourceUsernames[0]}` : `Empfohlen von ${sourceUsernames[0]}`;
  }
  if (personalAffinity > 0.6) return "Passt zu deinem Geschmack";
  return "Neu für dich zu entdecken";
}

type OwnProfile = {
  categoryFreq: Map<string, number>;
  maxFreq: number;
};

async function buildOwnProfile(supabase: SupabaseClient, userId: string): Promise<OwnProfile> {
  const [{ data: topList }, { data: watchlist }, { data: places }, { data: recs }] = await Promise.all([
    supabase.from("top_list").select("media_type").eq("user_id", userId),
    supabase.from("watchlist").select("media_type").eq("user_id", userId),
    supabase.from("places").select("places_category").eq("user_id", userId),
    supabase.from("recommendations").select("category_key").eq("user_id", userId).eq("status", "active"),
  ]);

  const categoryFreq = new Map<string, number>();
  const bump = (key: string) => categoryFreq.set(key, (categoryFreq.get(key) ?? 0) + 1);
  for (const row of topList ?? []) bump(`media:${row.media_type}`);
  for (const row of watchlist ?? []) bump(`media:${row.media_type}`);
  for (const row of places ?? []) bump(`place:${row.places_category}`);
  for (const row of recs ?? []) bump(`topf:${row.category_key}`);

  const maxFreq = Math.max(1, ...categoryFreq.values());
  return { categoryFreq, maxFreq };
}

function personalAffinity(profile: OwnProfile, categoryKey: string): number {
  const freq = profile.categoryFreq.get(categoryKey) ?? 0;
  if (freq === 0) return profile.categoryFreq.size === 0 ? 0.4 : 0.15;
  return freq / profile.maxFreq;
}

function score(params: {
  id: string;
  freshness: number;
  affinity: number;
  socialSupportCount: number;
}): number {
  const social = Math.min(1, params.socialSupportCount / SOCIAL_PROOF_CAP);
  const repeatValidation = params.socialSupportCount >= 2 ? 1 : params.socialSupportCount === 1 ? 0.4 : 0;
  const exploration = explorationScore(params.id);
  return (
    WEIGHT_FRESHNESS * params.freshness +
    WEIGHT_PERSONAL_AFFINITY * params.affinity +
    WEIGHT_SOCIAL_PROOF * social +
    WEIGHT_REPEAT_VALIDATION * repeatValidation +
    WEIGHT_EXPLORATION * exploration
  );
}

type MovieRow = {
  user_id: string;
  item_id: number;
  media_type: "movie" | "tv";
  title: string;
  image_url: string | null;
  note: string | null;
  created_at: string;
};

type PlaceRow = {
  user_id: string;
  google_place_id: string;
  name: string;
  address: string;
  photo_url: string | null;
  note: string | null;
  created_at: string;
  rating: number | null;
  places_category: string;
  lat: number;
  lng: number;
  region_id: string;
};

type RecommendationRow = {
  id: string;
  user_id: string;
  category_key: string;
  title: string;
  note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  source_type: SourceType;
  external_id: string | null;
};

/**
 * Gathers every scored candidate from the viewer's network (followed
 * friends' top_list/watchlist/places/recommendations rows -- the tables
 * that actually carry a title/image/note to show on a card; dont_watch and
 * item_interactions dislikes only ever exclude, never surface). Candidates
 * are always someone else's activity -- your own items never need
 * "discovering". Unordered by nothing in particular by the time it returns;
 * callers (the main "Für Dich" stream, and the supplementary sections) each
 * sort/slice this same pool their own way instead of re-querying the DB
 * per section.
 */
async function gatherNetworkCandidates(supabase: SupabaseClient, userId: string): Promise<DiscoveryCandidate[]> {
  const { data: followRows } = await supabase
    .from("user_follows")
    .select("followed_id")
    .eq("follower_id", userId);
  const followedIds = (followRows ?? []).map((row) => row.followed_id);

  const candidates: DiscoveryCandidate[] = [];

  if (followedIds.length > 0) {
    const [excludedMovieKeys, excludedPlaceIds, ownProfile, { data: ownRecRows }] = await Promise.all([
      getExcludedMovieKeys(supabase, userId),
      getExcludedPlaceIds(supabase, userId),
      buildOwnProfile(supabase, userId),
      supabase.from("recommendations").select("category_key, title").eq("user_id", userId).eq("status", "active"),
    ]);
    const ownRecommendationKeys = new Set(
      (ownRecRows ?? []).map((row) => `${row.category_key}:${row.title.trim().toLowerCase()}`),
    );

    const [{ data: usernameRows }, { data: topListRows }, { data: watchlistRows }, { data: placeRows }, { data: recRows }] =
      await Promise.all([
        supabase.from("profiles").select("id, username").in("id", followedIds),
        supabase
          .from("top_list")
          .select("user_id, item_id, media_type, title, image_url, note, created_at")
          .in("user_id", followedIds),
        supabase
          .from("watchlist")
          .select("user_id, item_id, media_type, title, image_url, note, created_at")
          .in("user_id", followedIds),
        supabase
          .from("places")
          .select(
            "user_id, google_place_id, name, address, photo_url, note, created_at, rating, places_category, lat, lng, region_id",
          )
          .in("user_id", followedIds),
        supabase
          .from("recommendations")
          .select("id, user_id, category_key, title, note, metadata, created_at, source_type, external_id")
          .in("user_id", followedIds)
          .eq("status", "active"),
      ]);
    const usernameById = new Map((usernameRows ?? []).map((row) => [row.id, row.username]));

    // Regionsnamen für die Like->savePlaceToRegion-Übernahme -- welche
    // Stadt/Region ein Ort beim Freund gehört, ist nicht auf der places-Zeile
    // selbst gespeichert (nur region_id), deshalb ein separater Lookup.
    const placeRegionIds = [...new Set(((placeRows ?? []) as PlaceRow[]).map((row) => row.region_id))];
    const { data: placeRegionRows } =
      placeRegionIds.length > 0
        ? await supabase.from("place_regions").select("id, region_name").in("id", placeRegionIds)
        : { data: [] as { id: string; region_name: string }[] };
    const regionNameById = new Map((placeRegionRows ?? []).map((row) => [row.id, row.region_name]));

    // --- Movies/TV: group top_list + watchlist rows by item identity ---
    type MovieGroup = { rows: MovieRow[]; userIds: Set<string> };
    const movieGroups = new Map<string, MovieGroup>();
    for (const row of [...(topListRows ?? []), ...((watchlistRows ?? []) as MovieRow[])] as MovieRow[]) {
      const key = `${row.media_type}-${row.item_id}`;
      if (excludedMovieKeys.has(key)) continue;
      const group = movieGroups.get(key) ?? { rows: [], userIds: new Set() };
      group.rows.push(row);
      group.userIds.add(row.user_id);
      movieGroups.set(key, group);
    }
    for (const [key, group] of movieGroups) {
      const rows = group.rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const withNote = rows.find((row) => row.note) ?? rows[0];
      const affinity = personalAffinity(ownProfile, `media:${withNote.media_type}`);
      const freshness = freshnessScore(rows[0].created_at);
      const socialSupportCount = group.userIds.size;
      const usernames = [...group.userIds].map((id) => usernameById.get(id)).filter((v): v is string => !!v);
      candidates.push({
        id: `movie-${key}`,
        title: withNote.title,
        category: withNote.media_type === "tv" ? "Serie" : "Film",
        location: null,
        imageUrl: withNote.image_url,
        sourceType: withNote.media_type,
        sourceUserId: withNote.user_id,
        sourceUsernames: usernames,
        note: withNote.note,
        rating: null,
        socialSupportCount,
        personalSupportCount: Math.round(affinity * 100),
        lastActivityAt: rows[0].created_at,
        promptMatchScore: 0.5,
        finalScore: score({ id: `movie-${key}`, freshness, affinity, socialSupportCount }),
        reason: buildReason({
          socialSupportCount,
          sourceUsernames: usernames,
          personalAffinity: affinity,
          freshness,
          isExploration: false,
        }),
        ref: { mediaType: withNote.media_type, tmdbId: withNote.item_id },
      });
    }

    // --- Places ---
    type PlaceGroup = { rows: PlaceRow[]; userIds: Set<string> };
    const placeGroups = new Map<string, PlaceGroup>();
    for (const row of (placeRows ?? []) as PlaceRow[]) {
      if (excludedPlaceIds.has(row.google_place_id)) continue;
      const group = placeGroups.get(row.google_place_id) ?? { rows: [], userIds: new Set() };
      group.rows.push(row);
      group.userIds.add(row.user_id);
      placeGroups.set(row.google_place_id, group);
    }
    for (const [placeId, group] of placeGroups) {
      const rows = group.rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const withNote = rows.find((row) => row.note) ?? rows[0];
      const affinity = personalAffinity(ownProfile, `place:${withNote.places_category}`);
      const freshness = freshnessScore(rows[0].created_at);
      const socialSupportCount = group.userIds.size;
      const usernames = [...group.userIds].map((id) => usernameById.get(id)).filter((v): v is string => !!v);
      candidates.push({
        id: `place-${placeId}`,
        title: withNote.name,
        category: isPlaceCategory(withNote.places_category)
          ? PLACE_CATEGORY_LABELS[withNote.places_category]
          : "Ort",
        location: withNote.address,
        imageUrl: withNote.photo_url,
        sourceType: "place",
        sourceUserId: withNote.user_id,
        sourceUsernames: usernames,
        note: withNote.note,
        rating: withNote.rating,
        socialSupportCount,
        personalSupportCount: Math.round(affinity * 100),
        lastActivityAt: rows[0].created_at,
        promptMatchScore: 0.5,
        finalScore: score({ id: `place-${placeId}`, freshness, affinity, socialSupportCount }),
        reason: buildReason({
          socialSupportCount,
          sourceUsernames: usernames,
          personalAffinity: affinity,
          freshness,
          isExploration: false,
        }),
        ref: {
          placeId,
          lat: withNote.lat,
          lng: withNote.lng,
          regionName: regionNameById.get(withNote.region_id),
          placeCategory: isPlaceCategory(withNote.places_category) ? withNote.places_category : undefined,
        },
      });
    }

    // --- Mein-Topf freeform recommendations ---
    type RecGroup = { rows: RecommendationRow[]; userIds: Set<string> };
    const recGroups = new Map<string, RecGroup>();
    for (const row of (recRows ?? []) as RecommendationRow[]) {
      const dedupeKey = `${row.category_key}:${row.title.trim().toLowerCase()}`;
      if (ownRecommendationKeys.has(dedupeKey)) continue;
      const group = recGroups.get(dedupeKey) ?? { rows: [], userIds: new Set() };
      group.rows.push(row);
      group.userIds.add(row.user_id);
      recGroups.set(dedupeKey, group);
    }
    for (const group of recGroups.values()) {
      const rows = group.rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const withNote = rows.find((row) => row.note) ?? rows[0];
      const affinity = personalAffinity(ownProfile, `topf:${withNote.category_key}`);
      const freshness = freshnessScore(rows[0].created_at);
      const socialSupportCount = group.userIds.size;
      const usernames = [...group.userIds].map((id) => usernameById.get(id)).filter((v): v is string => !!v);
      const imageUrl =
        withNote.metadata && typeof withNote.metadata.imageUrl === "string" ? withNote.metadata.imageUrl : null;
      candidates.push({
        id: `topf-${withNote.id}`,
        title: withNote.title,
        category: getRecommendationCategory(withNote.category_key)?.label ?? withNote.category_key,
        location: null,
        imageUrl,
        sourceType: "topf",
        sourceUserId: withNote.user_id,
        sourceUsernames: usernames,
        note: withNote.note,
        rating: null,
        socialSupportCount,
        personalSupportCount: Math.round(affinity * 100),
        lastActivityAt: rows[0].created_at,
        promptMatchScore: 0.5,
        finalScore: score({ id: `topf-${withNote.id}`, freshness, affinity, socialSupportCount }),
        reason: buildReason({
          socialSupportCount,
          sourceUsernames: usernames,
          personalAffinity: affinity,
          freshness,
          isExploration: false,
        }),
        ref: {
          recommendationId: withNote.id,
          recommendationCategoryKey: withNote.category_key,
          recommendationSourceType: withNote.source_type,
          recommendationExternalId: withNote.external_id,
          recommendationMetadata: withNote.metadata,
        },
      });
    }
  }

  return candidates;
}

export type RegionPrompt = { key: string; name: string; itemCount: number; friendCount: number };

/**
 * Backs the "Warst du schon mal hier?" nudge -- cities/regions the
 * viewer's network already has active Orte-lists for, ranked by activity.
 * Deliberately not scoped to the viewer's own home_city -- the whole point
 * is to surface places the viewer probably HASN'T built a list for yet.
 */
export async function getNetworkRegionPrompts(
  supabase: SupabaseClient,
  userId: string,
  limit = 6,
): Promise<RegionPrompt[]> {
  const { data: followRows } = await supabase
    .from("user_follows")
    .select("followed_id")
    .eq("follower_id", userId);
  const followedIds = (followRows ?? []).map((row) => row.followed_id);
  if (followedIds.length === 0) return [];

  const { data: regionRows } = await supabase
    .from("place_regions")
    .select("id, region_key, region_name, user_id")
    .in("user_id", followedIds);
  if (!regionRows || regionRows.length === 0) return [];

  const { data: placeRows } = await supabase
    .from("places")
    .select("region_id")
    .in(
      "region_id",
      regionRows.map((row) => row.id),
    );
  const itemCountByRegionId = new Map<string, number>();
  for (const row of placeRows ?? []) {
    itemCountByRegionId.set(row.region_id, (itemCountByRegionId.get(row.region_id) ?? 0) + 1);
  }

  // Merged by normalized region_key -- two friends' own "Berlin" region
  // rows count as one prompt with a combined friend/item count, not two.
  const byKey = new Map<string, { name: string; itemCount: number; userIds: Set<string> }>();
  for (const region of regionRows) {
    const itemCount = itemCountByRegionId.get(region.id) ?? 0;
    if (itemCount === 0) continue;
    const entry = byKey.get(region.region_key) ?? { name: region.region_name, itemCount: 0, userIds: new Set() };
    entry.itemCount += itemCount;
    entry.userIds.add(region.user_id);
    byKey.set(region.region_key, entry);
  }

  return [...byKey.entries()]
    .map(([key, entry]) => ({ key, name: entry.name, itemCount: entry.itemCount, friendCount: entry.userIds.size }))
    .sort((a, b) => b.itemCount - a.itemCount)
    .slice(0, limit);
}

/**
 * Ranked "Für Dich" main-stream page -- the live, interactive queue.
 * Excludes anything the client already showed this session and, if the
 * network pool runs short, tops up with the same generic recommendation
 * engine used elsewhere (lib/recommendations.ts) so the stream never runs
 * dry.
 */
export async function getDiscoveryFeed(
  supabase: SupabaseClient,
  userId: string,
  params: { excludeIds: Set<string>; limit: number; homeCity: string | null; tmdbApiKey?: string; placesApiKey?: string },
): Promise<{ candidates: DiscoveryCandidate[]; hasNetworkContent: boolean }> {
  const candidates = await gatherNetworkCandidates(supabase, userId);
  const hasNetworkContent = candidates.length > 0;
  let ranked = candidates
    .filter((candidate) => !params.excludeIds.has(candidate.id))
    .sort((a, b) => b.finalScore - a.finalScore);

  // Never-empty fallback: too little (or zero) network content -- top up
  // with the same generic "popular near you" / "matches your genre profile"
  // engine already used by Inspiration, tagged as low-confidence exploration
  // rather than social proof.
  if (ranked.length < params.limit) {
    const need = params.limit - ranked.length;
    const exploreCandidates = await buildExplorationFallback(supabase, userId, {
      need,
      excludeIds: params.excludeIds,
      alreadyIncludedIds: new Set(ranked.map((c) => c.id)),
      homeCity: params.homeCity,
      tmdbApiKey: params.tmdbApiKey,
      placesApiKey: params.placesApiKey,
    });
    ranked = [...ranked, ...exploreCandidates];
  }

  return { candidates: ranked.slice(0, params.limit), hasNetworkContent };
}

export type DiscoverySections = {
  freshFromFriends: DiscoveryCandidate[];
  popularInNetwork: DiscoveryCandidate[];
  related: DiscoveryCandidate[];
  moreFromRegion: DiscoveryCandidate[];
  newForYou: DiscoveryCandidate[];
};

/**
 * The 5 supplementary sections under the main stream -- reads from the same
 * gathered pool the main stream itself is built from (one DB round-trip),
 * just sorted/filtered differently per section. "Neu für dich" is the one
 * exception: genuinely novel content the network hasn't already surfaced,
 * so it goes through the exploration fallback engine instead of re-slicing
 * network data under a different label.
 */
export async function getDiscoverySections(
  supabase: SupabaseClient,
  userId: string,
  params: { homeCity: string | null; tmdbApiKey?: string; placesApiKey?: string; perSection?: number },
): Promise<DiscoverySections> {
  const perSection = params.perSection ?? 6;
  const all = await gatherNetworkCandidates(supabase, userId);

  const freshFromFriends = [...all]
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
    .slice(0, perSection);

  const popularInNetwork = [...all]
    .filter((c) => c.socialSupportCount >= 2)
    .sort((a, b) => b.socialSupportCount - a.socialSupportCount)
    .slice(0, perSection);

  const related = [...all]
    .filter((c) => c.personalSupportCount > 0)
    .sort((a, b) => b.personalSupportCount - a.personalSupportCount)
    .slice(0, perSection);

  const moreFromRegion = all
    .filter((c) => c.sourceType === "place" && (!params.homeCity || c.location?.includes(params.homeCity)))
    .slice(0, perSection);

  const usedIds = new Set(
    [...freshFromFriends, ...popularInNetwork, ...related, ...moreFromRegion].map((c) => c.id),
  );
  const newForYou = await buildExplorationFallback(supabase, userId, {
    need: perSection,
    excludeIds: usedIds,
    alreadyIncludedIds: usedIds,
    homeCity: params.homeCity,
    tmdbApiKey: params.tmdbApiKey,
    placesApiKey: params.placesApiKey,
  });

  return { freshFromFriends, popularInNetwork, related, moreFromRegion, newForYou };
}

export function placeSearchResultToCandidate(place: PlaceSearchResult, city: string, recommendedBy: string[]): DiscoveryCandidate {
  return {
    id: `place-${place.placeId}`,
    title: place.name,
    category: isPlaceCategory(place.category) ? PLACE_CATEGORY_LABELS[place.category] : "Ort",
    location: place.address,
    imageUrl: place.photoUrl,
    sourceType: "place",
    sourceUserId: null,
    sourceUsernames: recommendedBy,
    note: null,
    rating: place.rating,
    socialSupportCount: recommendedBy.length,
    personalSupportCount: 0,
    lastActivityAt: new Date().toISOString(),
    promptMatchScore: recommendedBy.length > 0 ? 0.8 : 0.4,
    finalScore: 0,
    reason:
      recommendedBy.length === 0
        ? `Beliebt in ${city}`
        : recommendedBy.length === 1
          ? `Empfohlen von ${recommendedBy[0]}`
          : `${recommendedBy.length} Freunde empfehlen das`,
    ref: {
      placeId: place.placeId,
      lat: place.lat,
      lng: place.lng,
      regionName: city,
      placeCategory: place.category,
      placeGoogleMapsUri: place.googleMapsUri,
      placeUserRatingCount: place.userRatingCount,
      placePriceLevel: place.priceLevel,
      placePhoneNumber: place.phoneNumber,
      placeWebsiteUri: place.websiteUri,
      placeOpeningStatus: place.openingStatus,
    },
  };
}

/**
 * Backs the "Warst du schon mal hier?" city drill-down: clicking a city
 * tile loads this instead of navigating away. Reuses the exact same shared
 * engine (lib/recommendations.ts's getCityPlaceRecommendations) that
 * already powers the Inspiration Orte tab and the suggestion strips under a
 * user's own region lists -- one ranking algorithm for "what's good in this
 * city", not a second one reinvented here.
 */
export async function getCityDiscoveryFeed(
  supabase: SupabaseClient,
  userId: string,
  city: string,
  placesApiKey: string | undefined,
  limit = 12,
): Promise<{ friendItems: DiscoveryCandidate[]; moreSuggestions: DiscoveryCandidate[] }> {
  if (!placesApiKey) return { friendItems: [], moreSuggestions: [] };

  const { fromFriends, generic } = await getCityPlaceRecommendations(supabase, userId, city, placesApiKey, limit);

  return {
    friendItems: fromFriends.map(({ place, recommendedBy }) => placeSearchResultToCandidate(place, city, recommendedBy)),
    moreSuggestions: generic.map((place) => placeSearchResultToCandidate(place, city, [])),
  };
}

async function buildExplorationFallback(
  supabase: SupabaseClient,
  userId: string,
  params: {
    need: number;
    excludeIds: Set<string>;
    alreadyIncludedIds: Set<string>;
    homeCity: string | null;
    tmdbApiKey?: string;
    placesApiKey?: string;
  },
): Promise<DiscoveryCandidate[]> {
  const results: DiscoveryCandidate[] = [];

  if (params.tmdbApiKey) {
    const movies = await getGenreProfileMovieRecommendations(supabase, userId, params.tmdbApiKey, params.need);
    for (const item of movies) {
      const id = `movie-${item.mediaType}-${item.id}`;
      if (params.excludeIds.has(id) || params.alreadyIncludedIds.has(id)) continue;
      results.push({
        id,
        title: item.title,
        category: item.mediaType === "tv" ? "Serie" : "Film",
        location: null,
        imageUrl: item.posterPath ? `https://image.tmdb.org/t/p/w500${item.posterPath}` : null,
        sourceType: item.mediaType,
        sourceUserId: null,
        sourceUsernames: [],
        note: null,
        rating: item.movieDetails.voteAverage,
        socialSupportCount: 0,
        personalSupportCount: 0,
        lastActivityAt: new Date().toISOString(),
        promptMatchScore: 0.3,
        finalScore: 0,
        reason: "Neu für dich zu entdecken",
        ref: { mediaType: item.mediaType, tmdbId: item.id },
      });
    }
  }

  if (results.length < params.need && params.homeCity && params.placesApiKey) {
    const { generic } = await getCityPlaceRecommendations(
      supabase,
      userId,
      params.homeCity,
      params.placesApiKey,
      params.need - results.length,
    );
    for (const place of generic) {
      const id = `place-${place.placeId}`;
      if (params.excludeIds.has(id) || params.alreadyIncludedIds.has(id)) continue;
      results.push({
        id,
        title: place.name,
        category: place.category && isPlaceCategory(place.category) ? PLACE_CATEGORY_LABELS[place.category] : "Ort",
        location: place.address,
        imageUrl: place.photoUrl,
        sourceType: "place",
        sourceUserId: null,
        sourceUsernames: [],
        note: null,
        rating: place.rating,
        socialSupportCount: 0,
        personalSupportCount: 0,
        lastActivityAt: new Date().toISOString(),
        promptMatchScore: 0.3,
        finalScore: 0,
        reason: "Beliebt in deiner Nähe",
        ref: {
          placeId: place.placeId,
          lat: place.lat,
          lng: place.lng,
          regionName: params.homeCity ?? undefined,
          placeCategory: place.category,
        },
      });
    }
  }

  // True cold start (no rating history to infer a genre profile from, no
  // home_city set): global trending is the last resort so a brand-new
  // signup's first "Für Dich" visit is never a dead, empty page.
  if (results.length < params.need && params.tmdbApiKey) {
    const trending = await getTrendingMovies(supabase, userId, params.tmdbApiKey, params.need - results.length);
    for (const item of trending) {
      const id = `movie-${item.mediaType}-${item.id}`;
      if (params.excludeIds.has(id) || params.alreadyIncludedIds.has(id) || results.some((r) => r.id === id)) continue;
      results.push({
        id,
        title: item.title,
        category: item.mediaType === "tv" ? "Serie" : "Film",
        location: null,
        imageUrl: item.posterPath ? `https://image.tmdb.org/t/p/w500${item.posterPath}` : null,
        sourceType: item.mediaType,
        sourceUserId: null,
        sourceUsernames: [],
        note: null,
        rating: item.movieDetails.voteAverage,
        socialSupportCount: 0,
        personalSupportCount: 0,
        lastActivityAt: new Date().toISOString(),
        promptMatchScore: 0.2,
        finalScore: 0,
        reason: "Gerade im Trend",
        ref: { mediaType: item.mediaType, tmdbId: item.id },
      });
    }
  }

  return results.slice(0, params.need);
}
