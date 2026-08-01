import type { SupabaseClient } from "@supabase/supabase-js";

export type WatchlistTransition = "like" | "dislike";

export type StoryEventItem = {
  itemId: number;
  mediaType: "movie" | "tv";
  title: string;
  imageUrl: string | null;
};

/**
 * Posts the "Watchlist -> Like/Dislike" story event triggered when a user
 * switches a watchlist item's status directly (see
 * components/lists/list-items-grid.tsx's handleStatusTransition). Read back
 * by app/api/story-updates/route.ts alongside the plain top_list/watchlist/
 * places additions, with its own generated message text.
 */
export async function postWatchlistTransitionStoryEvent(
  supabase: SupabaseClient,
  userId: string,
  transition: WatchlistTransition,
  item: StoryEventItem,
) {
  const { error } = await supabase.from("story_events").insert({
    user_id: userId,
    kind: "watchlist_transition",
    transition,
    item_id: item.itemId,
    media_type: item.mediaType,
    title: item.title,
    image_url: item.imageUrl,
  });
  if (error) {
    console.error("story_events insert failed", error);
  }
}

export function watchlistTransitionMessage(
  username: string,
  title: string,
  transition: WatchlistTransition,
): string {
  const verdict = transition === "like" ? "Gefällt mir" : "nicht gefällt";
  return `${username} hat ${title} von Watchlist auf ${verdict} geändert – hast du den Film gesehen?`;
}
