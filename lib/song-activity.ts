import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Neu" ring for the favorite-song-snippet feature -- the song equivalent
 * of lib/story-activity.ts's hasActiveStory, but comparing against a
 * per-(viewer, target)-pair "last heard" timestamp in story_views
 * (content_type = "song") instead of a fixed time window: a song stays
 * "unseen" for a given viewer until they've actually played it, however
 * long that takes, not just for 24h.
 */
export async function hasUnseenSong(
  supabase: SupabaseClient,
  viewerId: string,
  targetUserId: string,
  favoriteSongUpdatedAt: string | null,
): Promise<boolean> {
  if (!favoriteSongUpdatedAt) return false;

  const { data } = await supabase
    .from("story_views")
    .select("viewed_at")
    .eq("viewer_id", viewerId)
    .eq("target_user_id", targetUserId)
    .eq("content_type", "song")
    .maybeSingle();

  return !data || data.viewed_at < favoriteSongUpdatedAt;
}
