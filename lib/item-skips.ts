import type { SupabaseClient } from "@supabase/supabase-js";

export type SkipMediaType = "movie" | "tv" | "place";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Purely a technical resurfacing helper, not a user-facing state -- "Skip"
 * as its own concept/button/UI doesn't exist. lib/rating-engine.ts's
 * applyItemRating calls this alongside "Lohnt sich nicht" (30 days) and
 * "Kenne ich noch nicht" (7 days, shorter -- a neutral "don't know" should
 * come back around sooner than a deliberate negative), so the item quietly
 * stops appearing in this user's feeds for that long (see
 * lib/exclusions.ts) and then resurfaces on its own -- no manual reset, no
 * soft-delete bookkeeping. Never called on its own from UI.
 */
export async function recordSkip(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  mediaType: SkipMediaType,
  durationDays = 30,
) {
  const skippedAt = new Date();
  const expiresAt = new Date(skippedAt.getTime() + durationDays * DAY_MS);
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
