import type { SupabaseClient } from "@supabase/supabase-js";

export type SkipMediaType = "movie" | "tv" | "place";

const SKIP_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Purely a technical resurfacing helper now, not a user-facing state --
 * "Skip" as its own concept/button/UI no longer exists (Master-Audit
 * round). lib/rating.ts's recordDislike calls this alongside every "Nix für
 * mich", so a disliked item quietly stops appearing in this user's feeds
 * for 30 days (see lib/exclusions.ts) and then resurfaces on its own -- no
 * manual reset, no soft-delete bookkeeping. Never called on its own from UI
 * anymore.
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
