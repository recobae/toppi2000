import type { SupabaseClient } from "@supabase/supabase-js";

export type SkipMediaType = "movie" | "tv" | "place";

const SKIP_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Records "I don't know this / not right now" -- deliberately writes to its
 * own item_skips table, never item_interactions, so it can never leak into
 * taste-match, progress badges, or any other taste-based reading of
 * item_interactions. Purely hides the item from this user's own feeds for
 * 30 days (see lib/exclusions.ts), then it resurfaces on its own -- no
 * manual reset, no soft-delete bookkeeping.
 */
export async function recordSkip(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  mediaType: SkipMediaType,
) {
  const skippedAt = new Date();
  const expiresAt = new Date(skippedAt.getTime() + SKIP_DURATION_MS);
  return supabase.from("item_skips").upsert(
    {
      user_id: userId,
      item_id: itemId,
      media_type: mediaType,
      skipped_at: skippedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: "user_id,item_id,media_type" },
  );
}
