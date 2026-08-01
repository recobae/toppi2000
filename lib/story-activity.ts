import type { SupabaseClient } from "@supabase/supabase-js";

// Single definition of "has an active story" shared by every surface that
// renders a story ring (the profile page's own avatar, the "Ich folge" bar):
// the person added something to top_list/watchlist/places within the last
// 24h. Keeping this in one place means both surfaces can't drift apart on
// what "active" means or how long the window is.
export const STORY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function storyWindowSince(): string {
  return new Date(Date.now() - STORY_WINDOW_MS).toISOString();
}

export async function hasActiveStory(
  supabase: SupabaseClient,
  userId: string,
  since: string = storyWindowSince(),
): Promise<boolean> {
  const [{ count: topListCount }, { count: watchlistCount }, { count: placesCount }, { count: storyEventCount }] =
    await Promise.all([
      supabase
        .from("top_list")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since),
      supabase
        .from("watchlist")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since),
      supabase
        .from("places")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since),
      supabase
        .from("story_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since),
    ]);
  return (
    (topListCount ?? 0) + (watchlistCount ?? 0) + (placesCount ?? 0) + (storyEventCount ?? 0) > 0
  );
}
