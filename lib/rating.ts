import type { SupabaseClient } from "@supabase/supabase-js";
import { recordInteraction, type InteractionMediaType } from "@/lib/interactions";
import { recordSkip } from "@/lib/item-skips";

/**
 * "Nix für mich" -- the ONE negative rating action anywhere in the app.
 * "Skip" no longer exists as a separate concept (Master-Audit round): every
 * dislike is simultaneously (1) a permanent taste opinion in
 * item_interactions (so taste-match/social-proof stay accurate) and (2) a
 * 30-day resurfacing timer (lib/item-skips.ts -- kept only as an internal
 * technical helper now, never a user-visible state, button, or its own
 * analytics value). After 30 days the item quietly resurfaces on its own.
 * Every "Nix für mich" button in the app must call this, not
 * recordInteraction directly, so the resurfacing timer is never forgotten.
 */
export async function recordDislike(
  supabase: SupabaseClient,
  userId: string,
  params: { itemId: string; mediaType: InteractionMediaType; targetUserId?: string | null },
) {
  const [{ error }] = await Promise.all([
    recordInteraction(supabase, userId, { ...params, interactionType: "dislike" }),
    recordSkip(supabase, userId, params.itemId, params.mediaType),
  ]);
  return { error };
}
