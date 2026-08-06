import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Neue Bewertungen von Freunden" (Für Dich, Abschnitt 1) needs a single
 * per-viewer "last checked this feed" timestamp -- reuses the existing
 * story_views table (already the Story-Ring/Song-Ring "seen" mechanism)
 * instead of a new table: a self-referential row where target_user_id
 * equals the viewer's own id, tagged with a dedicated content_type, marks
 * "this viewer last checked the aggregated friend-ratings feed at time T".
 * Distinct from story_views' normal per-(viewer, one specific friend) rows.
 */
const CONTENT_TYPE = "friend_ratings";

export async function getLastSeenFriendRatingsAt(supabase: SupabaseClient, viewerId: string): Promise<string | null> {
  const { data } = await supabase
    .from("story_views")
    .select("viewed_at")
    .eq("viewer_id", viewerId)
    .eq("target_user_id", viewerId)
    .eq("content_type", CONTENT_TYPE)
    .maybeSingle();
  return data?.viewed_at ?? null;
}

/**
 * Best-effort, fire-and-forget: opening /fuer-dich IS having seen today's
 * friend-ratings feed, same "viewing counts as seen" convention the Story
 * viewer already uses (app/api/story-updates/route.ts). Must only be called
 * AFTER the page has already read the previous value via
 * getLastSeenFriendRatingsAt -- this overwrites it.
 */
export async function markFriendRatingsSeen(supabase: SupabaseClient, viewerId: string): Promise<void> {
  await supabase.from("story_views").upsert(
    {
      viewer_id: viewerId,
      target_user_id: viewerId,
      content_type: CONTENT_TYPE,
      viewed_at: new Date().toISOString(),
    },
    { onConflict: "viewer_id,target_user_id,content_type" },
  );
}
