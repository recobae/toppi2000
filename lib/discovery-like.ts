import type { SupabaseClient } from "@supabase/supabase-js";
import { recordInteraction } from "@/lib/interactions";
import { saveToCategory } from "@/lib/saved-items";
import { savePlaceToRegion } from "@/lib/place-items";
import { saveRecommendation } from "@/lib/topf";
import { createNotification } from "@/lib/notifications";
import type { DiscoveryCandidate } from "@/lib/discovery";

/** The reciprocity moment the core loop depends on: whoever originally shared this finds out it landed. */
async function notifySource(supabase: SupabaseClient, userId: string, candidate: DiscoveryCandidate) {
  if (!candidate.sourceUserId) return;
  await createNotification(supabase, {
    userId: candidate.sourceUserId,
    actorId: userId,
    type: "adopted",
    title: candidate.title,
  });
}

/**
 * "Like = direkt auf die eigene Liste" -- one tap both records the taste
 * signal AND adopts the item onto the viewer's own equivalent list
 * (Empfohlen for movies/tv, the matching Orte-region for places, the
 * viewer's own Mein-Topf pot for freeform recommendations), crediting
 * whichever friend it came from. No note is captured here by design --
 * that stays optional, added later from within the saved list itself, so
 * a Like never blocks on a second decision.
 */
export async function likeAndSaveCandidate(
  supabase: SupabaseClient,
  userId: string,
  candidate: DiscoveryCandidate,
): Promise<void> {
  switch (candidate.sourceType) {
    case "movie":
    case "tv": {
      if (candidate.ref.tmdbId === undefined) return;
      await Promise.all([
        recordInteraction(supabase, userId, {
          itemId: String(candidate.ref.tmdbId),
          mediaType: candidate.sourceType,
          interactionType: "like",
          targetUserId: candidate.sourceUserId,
        }),
        saveToCategory(
          supabase,
          "top_list",
          userId,
          {
            itemId: candidate.ref.tmdbId,
            mediaType: candidate.sourceType,
            title: candidate.title,
            imageUrl: candidate.imageUrl,
            year: null,
          },
          candidate.sourceUserId ?? undefined,
        ),
      ]);
      await notifySource(supabase, userId, candidate);
      return;
    }
    case "place": {
      const { placeId, lat, lng, regionName, placeCategory } = candidate.ref;
      if (!placeId || lat === undefined || lng === undefined || !regionName || !placeCategory) return;
      await Promise.all([
        recordInteraction(supabase, userId, {
          itemId: placeId,
          mediaType: "place",
          interactionType: "like",
          targetUserId: candidate.sourceUserId,
        }),
        savePlaceToRegion(
          supabase,
          userId,
          regionName,
          {
            placeId,
            name: candidate.title,
            address: candidate.location ?? "",
            lat,
            lng,
            category: placeCategory,
            photoUrl: candidate.imageUrl,
            rating: candidate.rating,
          },
          candidate.sourceUserId ?? undefined,
        ),
      ]);
      await notifySource(supabase, userId, candidate);
      return;
    }
    case "topf": {
      const { recommendationCategoryKey, recommendationSourceType } = candidate.ref;
      if (!recommendationCategoryKey || !recommendationSourceType) return;
      await saveRecommendation(supabase, {
        userId,
        categoryKey: recommendationCategoryKey,
        title: candidate.title,
        note: null,
        sourceType: recommendationSourceType,
        externalId: candidate.ref.recommendationExternalId ?? null,
        metadata: candidate.ref.recommendationMetadata ?? null,
        recommenderUserId: candidate.sourceUserId ?? userId,
      });
      await notifySource(supabase, userId, candidate);
      return;
    }
  }
}
