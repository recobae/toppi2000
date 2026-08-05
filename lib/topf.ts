import type { SupabaseClient } from "@supabase/supabase-js";
import { searchPlaces } from "@/lib/google-places";
import type { RecommendationCategory } from "@/lib/recommendation-categories";

const UNIQUE_VIOLATION_CODE = "23505";

export type SourceType = "place" | "media" | "freeform";

export type RecommendationRow = {
  id: string;
  userId: string;
  categoryKey: string;
  title: string;
  note: string | null;
  sourceType: SourceType;
  externalId: string | null;
  url: string | null;
  metadata: Record<string, unknown> | null;
  status: "active" | "expired" | "archived";
  createdAt: string;
};

export type Recommender = {
  id: string;
  recommenderUserId: string;
  recommenderUsername: string;
  note: string | null;
  createdAt: string;
};

export type RecommendationWithRecommenders = RecommendationRow & {
  recommenders: Recommender[];
};

/**
 * Saves one item to a user's own "pot" -- either merging into an existing
 * row (same user_id + category_key + external_id, or an explicit
 * mergeIntoId from a confirmed fuzzy-duplicate prompt) by attaching a new
 * recommender, or creating a brand-new recommendations row. Never creates a
 * second row for the same (user, category, external item).
 */
export async function saveRecommendation(
  supabase: SupabaseClient,
  params: {
    userId: string;
    categoryKey: string;
    title: string;
    note: string | null;
    sourceType: SourceType;
    externalId?: string | null;
    url?: string | null;
    metadata?: Record<string, unknown> | null;
    /** Who the pot owner heard this from -- defaults to the pot owner themselves (a self-found entry). */
    recommenderUserId?: string;
    recommenderNote?: string | null;
    /** Set when the UI already confirmed merging into a specific existing row (external_id match or a user-confirmed fuzzy-duplicate suggestion). */
    mergeIntoId?: string;
  },
): Promise<{ error: { message: string } | null; recommendationId?: string | null; merged: boolean }> {
  const recommenderUserId = params.recommenderUserId ?? params.userId;
  let recommendationId: string | null = params.mergeIntoId ?? null;
  let merged = Boolean(recommendationId);

  if (!recommendationId && params.externalId) {
    const { data: existing } = await supabase
      .from("recommendations")
      .select("id")
      .eq("user_id", params.userId)
      .eq("category_key", params.categoryKey)
      .eq("external_id", params.externalId)
      .maybeSingle();
    if (existing) {
      recommendationId = existing.id;
      merged = true;
    }
  }

  if (!recommendationId) {
    const { data: inserted, error } = await supabase
      .from("recommendations")
      .insert({
        user_id: params.userId,
        category_key: params.categoryKey,
        title: params.title,
        note: params.note,
        source_type: params.sourceType,
        external_id: params.externalId ?? null,
        url: params.url ?? null,
        metadata: params.metadata ?? null,
      })
      .select("id")
      .single();
    if (error || !inserted) return { error, merged: false };
    recommendationId = inserted.id;
  }

  const { error: recommenderError } = await supabase.from("recommendation_recommenders").upsert(
    {
      recommendation_id: recommendationId,
      recommender_user_id: recommenderUserId,
      note: params.recommenderNote ?? params.note ?? null,
    },
    { onConflict: "recommendation_id,recommender_user_id", ignoreDuplicates: true },
  );
  if (recommenderError) return { error: recommenderError, merged };

  return { error: null, recommendationId, merged };
}

export type SimilarRecommendation = { id: string; title: string; similarity: number };

/**
 * Freeform-only fuzzy duplicate check (Abschnitt 3) -- never auto-merges;
 * the UI surfaces this to the user, who decides whether to merge into an
 * existing row (via saveRecommendation's mergeIntoId) or create a new one.
 */
export async function findSimilarRecommendations(
  supabase: SupabaseClient,
  userId: string,
  categoryKey: string,
  title: string,
): Promise<SimilarRecommendation[]> {
  const { data } = await supabase.rpc("find_similar_recommendations", {
    p_user_id: userId,
    p_category_key: categoryKey,
    p_title: title,
  });
  return (data ?? []) as SimilarRecommendation[];
}

/** All active items in one category of one user's pot, with every recommender attached to each. */
export async function getRecommendationsForCategory(
  supabase: SupabaseClient,
  userId: string,
  categoryKey: string,
): Promise<RecommendationWithRecommenders[]> {
  const { data: rows } = await supabase
    .from("recommendations")
    .select("id, user_id, category_key, title, note, source_type, external_id, url, metadata, status, created_at")
    .eq("user_id", userId)
    .eq("category_key", categoryKey)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (!rows || rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const { data: recommenderRows } = await supabase
    .from("recommendation_recommenders")
    .select("id, recommendation_id, recommender_user_id, note, created_at")
    .in("recommendation_id", ids);

  const recommenderUserIds = [...new Set((recommenderRows ?? []).map((row) => row.recommender_user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", recommenderUserIds);
  const usernameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]));

  const recommendersByItemId = new Map<string, Recommender[]>();
  for (const row of recommenderRows ?? []) {
    const list = recommendersByItemId.get(row.recommendation_id) ?? [];
    list.push({
      id: row.id,
      recommenderUserId: row.recommender_user_id,
      recommenderUsername: usernameById.get(row.recommender_user_id) ?? "",
      note: row.note,
      createdAt: row.created_at,
    });
    recommendersByItemId.set(row.recommendation_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    categoryKey: row.category_key,
    title: row.title,
    note: row.note,
    sourceType: row.source_type as SourceType,
    externalId: row.external_id,
    url: row.url,
    metadata: row.metadata as Record<string, unknown> | null,
    status: row.status as RecommendationRow["status"],
    createdAt: row.created_at,
    recommenders: recommendersByItemId.get(row.id) ?? [],
  }));
}

/** Records a thank-you for one specific recommender attribution. Already-thanked is not an error -- the unique constraint just makes the insert a no-op. */
export async function recordThanks(
  supabase: SupabaseClient,
  recommenderId: string,
  thankedByUserId: string,
) {
  const { error } = await supabase
    .from("recommendation_thanks")
    .insert({ recommender_id: recommenderId, thanked_by_user_id: thankedByUserId });
  if (error && error.code !== UNIQUE_VIOLATION_CODE) return { error };
  return { error: null };
}

export async function getThankedRecommenderIds(
  supabase: SupabaseClient,
  thankedByUserId: string,
  recommenderIds: string[],
): Promise<Set<string>> {
  if (recommenderIds.length === 0) return new Set();
  const { data } = await supabase
    .from("recommendation_thanks")
    .select("recommender_id")
    .eq("thanked_by_user_id", thankedByUserId)
    .in("recommender_id", recommenderIds);
  return new Set((data ?? []).map((row) => row.recommender_id));
}

/** Per-category item counts for the home screen's category chips. */
export async function getCategoryCounts(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, number>> {
  const { data } = await supabase
    .from("recommendations")
    .select("category_key")
    .eq("user_id", userId)
    .eq("status", "active");

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.category_key] = (counts[row.category_key] ?? 0) + 1;
  }
  return counts;
}

export type TopfOverview = { totalItems: number; friendCount: number; categoryCount: number };

/** Backs the home screen's "1.847 Empfehlungen von 6 Freunden · 12 Kategorien" counter line. */
export async function getTopfOverview(supabase: SupabaseClient, userId: string): Promise<TopfOverview> {
  const { data: rows } = await supabase
    .from("recommendations")
    .select("id, category_key")
    .eq("user_id", userId)
    .eq("status", "active");
  const items = rows ?? [];
  const ids = items.map((row) => row.id);

  let friendCount = 0;
  if (ids.length > 0) {
    const { data: recommenderRows } = await supabase
      .from("recommendation_recommenders")
      .select("recommender_user_id")
      .in("recommendation_id", ids);
    friendCount = new Set((recommenderRows ?? []).map((row) => row.recommender_user_id)).size;
  }

  return {
    totalItems: items.length,
    friendCount,
    categoryCount: new Set(items.map((row) => row.category_key)).size,
  };
}

/**
 * How many of the viewer's own active Topf entries were explicitly
 * attributed to a specific other user via "Wer empfiehlt das?" -- backs
 * the foreign-profile "[Username] hat N Empfehlungen für dich"-line.
 * Attribution-based like contributorUserIds/getTopfContributorIds, just
 * scoped to one recommender and answered from the recipient's side.
 */
export async function countRecommendationsGivenTo(
  supabase: SupabaseClient,
  recommenderId: string,
  recipientId: string,
): Promise<number> {
  const { data: recipientRows } = await supabase
    .from("recommendations")
    .select("id")
    .eq("user_id", recipientId)
    .eq("status", "active");
  const recipientIds = (recipientRows ?? []).map((row) => row.id);
  if (recipientIds.length === 0) return 0;

  const { count } = await supabase
    .from("recommendation_recommenders")
    .select("id", { count: "exact", head: true })
    .in("recommendation_id", recipientIds)
    .eq("recommender_user_id", recommenderId);
  return count ?? 0;
}

/** Most recently added items across all categories, for the home screen's "Zuletzt hinzugefügt" feed. */
export async function getRecentRecommendations(
  supabase: SupabaseClient,
  userId: string,
  limit = 10,
): Promise<RecommendationRow[]> {
  const { data } = await supabase
    .from("recommendations")
    .select("id, user_id, category_key, title, note, source_type, external_id, url, metadata, status, created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    categoryKey: row.category_key,
    title: row.title,
    note: row.note,
    sourceType: row.source_type as SourceType,
    externalId: row.external_id,
    url: row.url,
    metadata: row.metadata as Record<string, unknown> | null,
    status: row.status as RecommendationRow["status"],
    createdAt: row.created_at,
  }));
}

/** Most recent items across all categories, with recommenders attached -- backs the home screen's "Zuletzt hinzugefügt" feed. */
export async function getRecentRecommendationsWithRecommenders(
  supabase: SupabaseClient,
  userId: string,
  limit = 10,
): Promise<RecommendationWithRecommenders[]> {
  const rows = await getRecentRecommendations(supabase, userId, limit);
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const { data: recommenderRows } = await supabase
    .from("recommendation_recommenders")
    .select("id, recommendation_id, recommender_user_id, note, created_at")
    .in("recommendation_id", ids);

  const recommenderUserIds = [...new Set((recommenderRows ?? []).map((row) => row.recommender_user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", recommenderUserIds);
  const usernameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]));

  const recommendersByItemId = new Map<string, Recommender[]>();
  for (const row of recommenderRows ?? []) {
    const list = recommendersByItemId.get(row.recommendation_id) ?? [];
    list.push({
      id: row.id,
      recommenderUserId: row.recommender_user_id,
      recommenderUsername: usernameById.get(row.recommender_user_id) ?? "",
      note: row.note,
      createdAt: row.created_at,
    });
    recommendersByItemId.set(row.recommendation_id, list);
  }

  return rows.map((row) => ({ ...row, recommenders: recommendersByItemId.get(row.id) ?? [] }));
}

export type AutoFillSuggestion = {
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  externalId: string;
  rating: number | null;
  ratingCount: number | null;
};

const PLACE_AUTO_FILL_MIN_RATING = 4.0;
const PLACE_AUTO_FILL_MIN_RATING_COUNT = 20;
const AUTO_FILL_LIMIT = 10;

/**
 * Cold-start fallback (Abschnitt 6) when a category has zero friend
 * recommendations yet. `place` uses the same text-search-by-city pattern
 * already established in lib/recommendations.ts's getCityPlaceRecommendations
 * (no dedicated nearby/geo-radius API exists in this project). `media` and
 * `freeform` groups intentionally return no results -- neither Google Books
 * nor the free iTunes Search API expose a reliable popularity ranking, and
 * freeform has no external source at all (matches the spec's own reasoning
 * for why Bücher gets none, extended consistently to Musik/Podcasts).
 */
export async function getAutoFillSuggestions(
  category: RecommendationCategory,
  userCity: string | null,
  placesApiKey: string | undefined,
): Promise<AutoFillSuggestion[]> {
  if (category.group !== "place" || !userCity || !placesApiKey) return [];

  const results = await searchPlaces(`${category.label} in ${userCity}`, placesApiKey);
  return results
    .filter(
      (place) =>
        (place.rating ?? 0) >= PLACE_AUTO_FILL_MIN_RATING &&
        (place.userRatingCount ?? 0) >= PLACE_AUTO_FILL_MIN_RATING_COUNT,
    )
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, AUTO_FILL_LIMIT)
    .map((place) => ({
      title: place.name,
      subtitle: place.address,
      imageUrl: place.photoUrl,
      externalId: place.placeId,
      rating: place.rating,
      ratingCount: place.userRatingCount,
    }));
}
