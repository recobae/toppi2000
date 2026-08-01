import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CATEGORY_LABELS, type SavedCategory } from "@/lib/categories";
import { watchlistTransitionMessage, type WatchlistTransition } from "@/lib/story-events";

const STORY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type StoryUpdate = {
  id: string;
  category: "top_list" | "watchlist" | "places" | "watchlist_transition";
  itemId: number | null;
  mediaType: "movie" | "tv" | null;
  placeId: string | null;
  title: string;
  imageUrl: string | null;
  categoryLabel: string;
  createdAt: string;
  /** Set for watchlist_transition entries -- overrides the generic "X hat Y hinzugefügt" line. */
  message?: string;
};

/**
 * Returns a person's last-24h list additions across Top-Liste, Watchlist
 * and Orte, plus watchlist Like/Dislike-transition events, newest first, and
 * marks the story as viewed by the current user as a side effect -- opening
 * the story IS "having seen it".
 */
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  if (!viewer) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", username)
    .single();

  if (!target) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const since = new Date(Date.now() - STORY_WINDOW_MS).toISOString();

  const [topList, watchlist, places, storyEvents] = await Promise.all([
    supabase
      .from("top_list")
      .select("id, item_id, media_type, title, image_url, created_at")
      .eq("user_id", target.id)
      .gte("created_at", since),
    supabase
      .from("watchlist")
      .select("id, item_id, media_type, title, image_url, created_at")
      .eq("user_id", target.id)
      .gte("created_at", since),
    supabase
      .from("places")
      .select("id, google_place_id, name, photo_url, created_at")
      .eq("user_id", target.id)
      .gte("created_at", since),
    supabase
      .from("story_events")
      .select("id, kind, transition, item_id, media_type, title, image_url, created_at")
      .eq("user_id", target.id)
      .gte("created_at", since),
  ]);

  const categoryLabelFor = (category: SavedCategory) => CATEGORY_LABELS[category];

  const updates: StoryUpdate[] = [
    ...(topList.data ?? []).map((row) => ({
      id: row.id,
      category: "top_list" as const,
      itemId: row.item_id,
      mediaType: row.media_type as "movie" | "tv",
      placeId: null,
      title: row.title,
      imageUrl: row.image_url,
      categoryLabel: categoryLabelFor("top_list"),
      createdAt: row.created_at,
    })),
    ...(watchlist.data ?? []).map((row) => ({
      id: row.id,
      category: "watchlist" as const,
      itemId: row.item_id,
      mediaType: row.media_type as "movie" | "tv",
      placeId: null,
      title: row.title,
      imageUrl: row.image_url,
      categoryLabel: categoryLabelFor("watchlist"),
      createdAt: row.created_at,
    })),
    ...(places.data ?? []).map((row) => ({
      id: row.id,
      category: "places" as const,
      itemId: null,
      mediaType: null,
      placeId: row.google_place_id,
      title: row.name,
      imageUrl: row.photo_url,
      categoryLabel: "Orte",
      createdAt: row.created_at,
    })),
    ...(storyEvents.data ?? []).map((row) => ({
      id: row.id,
      category: "watchlist_transition" as const,
      itemId: row.item_id,
      mediaType: row.media_type as "movie" | "tv",
      placeId: null,
      title: row.title,
      imageUrl: row.image_url,
      categoryLabel: row.transition === "like" ? "Gefällt mir" : "Gefällt mir nicht",
      createdAt: row.created_at,
      message: watchlistTransitionMessage(
        target.username,
        row.title,
        row.transition as WatchlistTransition,
      ),
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // Best-effort -- if this fails the story just stays unread, not fatal.
  await supabase.from("story_views").upsert(
    { viewer_id: viewer.id, target_user_id: target.id, viewed_at: new Date().toISOString() },
    { onConflict: "viewer_id,target_user_id" },
  );

  return NextResponse.json({ username: target.username, ownerId: target.id, updates });
}
