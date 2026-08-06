import type { SupabaseClient } from "@supabase/supabase-js";
import { recordDislike } from "@/lib/rating";
import type { DiscoveryCandidate } from "@/lib/discovery";

/**
 * "Nix für mich" for a Für-Dich candidate -- symmetric to
 * lib/discovery-like.ts's likeAndSaveCandidate. Movies/tv/places all go
 * through the one shared lib/rating.ts#recordDislike (permanent taste
 * opinion + 30-day resurfacing timer). Mein-Topf-Einträge have no
 * per-item interaction table of their own, so a dislike there is
 * deliberately just a session-local dismissal (documented, not a silent
 * gap) -- same exception discovery-like.ts's like path doesn't have to make
 * since saveRecommendation always has somewhere to write.
 */
export async function dislikeCandidate(
  supabase: SupabaseClient,
  userId: string,
  candidate: DiscoveryCandidate,
): Promise<void> {
  switch (candidate.sourceType) {
    case "movie":
    case "tv": {
      if (candidate.ref.tmdbId === undefined) return;
      await recordDislike(supabase, userId, {
        itemId: String(candidate.ref.tmdbId),
        mediaType: candidate.sourceType,
        targetUserId: candidate.sourceUserId,
      });
      return;
    }
    case "place": {
      if (!candidate.ref.placeId) return;
      await recordDislike(supabase, userId, {
        itemId: candidate.ref.placeId,
        mediaType: "place",
        targetUserId: candidate.sourceUserId,
      });
      return;
    }
    case "topf":
      return;
  }
}
