import type { SupabaseClient } from "@supabase/supabase-js";
import { recordInteraction, type InteractionMediaType } from "@/lib/interactions";
import { recordSkip } from "@/lib/item-skips";
import { upsertLikeCredits, clearLikeCredits, recordInspiredCredits } from "@/lib/interaction-credits";
import { saveToCategory, type SavableItem } from "@/lib/saved-items";
import { savePlaceToRegion, type SavablePlace, type PlaceStatus } from "@/lib/place-items";
import { saveRecommendation } from "@/lib/topf";
import { createNotification } from "@/lib/notifications";
import type { DiscoveryCandidate } from "@/lib/discovery";

/**
 * The one, product-facing rating vocabulary. Every rating action anywhere in
 * the app -- Lohnt-sich?-Quick-Swipe, Für-Dich-Feed, Listen-Ansichten,
 * Story-Viewer, Meine Aktivität -- goes through this file instead of each
 * surface rolling its own item_interactions/interaction_credits calls.
 * "like"/"dislike" stay as the underlying DB values (renaming the column
 * values would be a disruptive migration for zero behavioural benefit,
 * explicitly allowed as a documented transitional technical name); "neutral"
 * is the new third state backing "Kenne ich noch nicht".
 */
export type RatingDecision = "lohnt_sich" | "lohnt_sich_nicht" | "kenne_ich_nicht";

export type RatingInteractionType = "like" | "dislike" | "neutral";

const DB_INTERACTION_TYPE: Record<RatingDecision, RatingInteractionType> = {
  lohnt_sich: "like",
  lohnt_sich_nicht: "dislike",
  kenne_ich_nicht: "neutral",
};

// How long a rated item stays excluded from feeds before it's allowed to
// resurface. "Lohnt sich" doesn't need an entry here -- a liked item is
// permanently excluded because it's already on one of the user's own lists
// (lib/exclusions.ts checks that separately).
const RESURFACE_DAYS: Partial<Record<RatingDecision, number>> = {
  lohnt_sich_nicht: 30,
  kenne_ich_nicht: 7,
};

export type RatingItem = { itemId: string; mediaType: InteractionMediaType };

/**
 * Writes exactly one item_interactions row for `decision`, plus whatever
 * side-effect that decision implies:
 *  - lohnt_sich: "like" credits for every followed owner of this item.
 *  - lohnt_sich_nicht: clears any like credits this actor had previously
 *    handed out for the item, starts the resurfacing timer.
 *  - kenne_ich_nicht: no credit write at all (neither positive nor
 *    negative), no notification -- a genuinely neutral, non-statistical
 *    state. Still starts a (shorter) resurfacing timer so the same card
 *    doesn't reappear on the very next reload.
 *
 * Callers decide whether to `await` this or fire it in the background --
 * this function never blocks on anything the UI needs synchronously.
 */
export async function applyItemRating(
  supabase: SupabaseClient,
  actorUserId: string,
  item: RatingItem,
  decision: RatingDecision,
  ownerUserIds: string[] = [],
): Promise<{ error: { message: string } | null }> {
  const interactionType = DB_INTERACTION_TYPE[decision];
  const resurfaceDays = RESURFACE_DAYS[decision];

  const sideEffects: Promise<unknown>[] = [];
  if (resurfaceDays) {
    sideEffects.push(recordSkip(supabase, actorUserId, item.itemId, item.mediaType, resurfaceDays));
  }
  if (decision === "lohnt_sich") {
    if (ownerUserIds.length > 0) {
      sideEffects.push(upsertLikeCredits(supabase, actorUserId, ownerUserIds, item));
    }
  } else if (decision === "lohnt_sich_nicht") {
    sideEffects.push(clearLikeCredits(supabase, actorUserId, item));
  }
  // kenne_ich_nicht: no credit call at all -- neither grant nor clear.

  const [{ error }] = await Promise.all([
    recordInteraction(supabase, actorUserId, {
      itemId: item.itemId,
      mediaType: item.mediaType,
      interactionType,
    }),
    Promise.all(sideEffects),
  ]);
  return { error: error ?? null };
}

export type ListTarget =
  | { kind: "movie"; category: "top_list" | "watchlist"; item: SavableItem }
  | { kind: "place"; regionName: string; place: SavablePlace; status?: PlaceStatus }
  | {
      kind: "topf";
      categoryKey: string;
      title: string;
      sourceType: import("@/lib/topf").SourceType;
      externalId?: string | null;
      metadata?: Record<string, unknown> | null;
    };

/**
 * Adds an item to the actor's own list -- deliberately independent of
 * applyItemRating (rating and adding are two separate fachliche Ereignisse).
 * When `adoptedFromOwnerIds` is non-empty, grants "inspired" credits to
 * every one of those owners and notifies each of them once. The actual list
 * row only remembers a single `adopted_from` owner (its column is scalar),
 * but the credit ledger correctly fans out to all of them.
 */
export async function addItemToOwnList(
  supabase: SupabaseClient,
  actorUserId: string,
  target: ListTarget,
  adoptedFromOwnerIds: string[] = [],
): Promise<{ error: { message: string } | null }> {
  const primaryOwner = adoptedFromOwnerIds[0] ?? null;
  let title: string;

  if (target.kind === "movie") {
    const { error } = await saveToCategory(supabase, target.category, actorUserId, target.item, primaryOwner);
    if (error) return { error };
    title = target.item.title;
  } else if (target.kind === "place") {
    const { error } = await savePlaceToRegion(
      supabase,
      actorUserId,
      target.regionName,
      target.place,
      primaryOwner,
      target.status,
    );
    if (error) return { error };
    title = target.place.name;
  } else {
    const { error } = await saveRecommendation(supabase, {
      userId: actorUserId,
      categoryKey: target.categoryKey,
      title: target.title,
      note: null,
      sourceType: target.sourceType,
      externalId: target.externalId ?? null,
      metadata: target.metadata ?? null,
      recommenderUserId: primaryOwner ?? actorUserId,
    });
    if (error) return { error };
    title = target.title;
  }

  if (adoptedFromOwnerIds.length === 0) return { error: null };

  const item: RatingItem | null =
    target.kind === "movie"
      ? { itemId: String(target.item.itemId), mediaType: target.item.mediaType }
      : target.kind === "place"
        ? { itemId: target.place.placeId, mediaType: "place" }
        : null;

  await Promise.all([
    item ? recordInspiredCredits(supabase, actorUserId, adoptedFromOwnerIds, item) : Promise.resolve(),
    ...adoptedFromOwnerIds.map((ownerId) =>
      createNotification(supabase, { userId: ownerId, actorId: actorUserId, type: "adopted", title }),
    ),
  ]);

  return { error: null };
}

function candidateToRatingItem(candidate: DiscoveryCandidate): RatingItem | null {
  if (candidate.sourceType === "movie" || candidate.sourceType === "tv") {
    if (candidate.ref.tmdbId === undefined) return null;
    return { itemId: String(candidate.ref.tmdbId), mediaType: candidate.sourceType };
  }
  if (candidate.sourceType === "place") {
    if (!candidate.ref.placeId) return null;
    return { itemId: candidate.ref.placeId, mediaType: "place" };
  }
  return null; // topf candidates have no item_interactions row -- see lib/discovery-dislike.ts's historical behaviour
}

function candidateToListTarget(candidate: DiscoveryCandidate): ListTarget | null {
  if (candidate.sourceType === "movie" || candidate.sourceType === "tv") {
    if (candidate.ref.tmdbId === undefined) return null;
    return {
      kind: "movie",
      category: "top_list",
      item: {
        itemId: candidate.ref.tmdbId,
        mediaType: candidate.sourceType,
        title: candidate.title,
        imageUrl: candidate.imageUrl,
        year: null,
      },
    };
  }
  if (candidate.sourceType === "place") {
    const { placeId, lat, lng, regionName, placeCategory } = candidate.ref;
    if (!placeId || lat === undefined || lng === undefined || !regionName || !placeCategory) return null;
    return {
      kind: "place",
      regionName,
      place: {
        placeId,
        name: candidate.title,
        address: candidate.location ?? "",
        lat,
        lng,
        category: placeCategory,
        photoUrl: candidate.imageUrl,
        rating: candidate.rating,
      },
    };
  }
  if (candidate.sourceType === "topf") {
    const { recommendationCategoryKey, recommendationSourceType } = candidate.ref;
    if (!recommendationCategoryKey || !recommendationSourceType) return null;
    return {
      kind: "topf",
      categoryKey: recommendationCategoryKey,
      title: candidate.title,
      sourceType: recommendationSourceType,
      externalId: candidate.ref.recommendationExternalId ?? null,
      metadata: candidate.ref.recommendationMetadata ?? null,
    };
  }
  return null;
}

/**
 * The one entry point every discovery/feed surface (Lohnt-sich?-Quick-Swipe,
 * Für-Dich-Sections) uses to rate a DiscoveryCandidate. Replaces the old
 * lib/discovery-like.ts#likeAndSaveCandidate + lib/discovery-dislike.ts#dislikeCandidate
 * split, and additionally fixes the gap those two never covered: neither of
 * them ever wrote an interaction_credits row, so followed owners never got
 * credited for candidates rated straight from a feed. `candidate.sourceOwnerIds`
 * (falling back to the single `sourceUserId` for candidates built before that
 * field existed) is resolved once at feed-build time -- rating a card never
 * needs an extra Supabase round-trip to find out who owns it.
 */
export async function rateCandidate(
  supabase: SupabaseClient,
  actorUserId: string,
  candidate: DiscoveryCandidate,
  decision: RatingDecision,
): Promise<{ error: { message: string } | null }> {
  const item = candidateToRatingItem(candidate);
  const ownerIds = candidate.sourceOwnerIds ?? (candidate.sourceUserId ? [candidate.sourceUserId] : []);

  if (item) {
    const { error } = await applyItemRating(supabase, actorUserId, item, decision, ownerIds);
    if (error) return { error };
  }

  if (decision === "lohnt_sich") {
    const listTarget = candidateToListTarget(candidate);
    if (listTarget) {
      return addItemToOwnList(supabase, actorUserId, listTarget, ownerIds);
    }
  }

  return { error: null };
}
