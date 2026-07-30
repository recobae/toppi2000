import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedCategory } from "@/lib/categories";

export type SavableItem = {
  itemId: number;
  mediaType: "movie" | "tv";
  title: string;
  imageUrl: string | null;
  year: string | null;
};

/**
 * Saves an item to one of the 3 ranked categories (top_list/watchlist/
 * dont_watch). New items always go to the top (lowest position).
 */
export async function saveToCategory(
  supabase: SupabaseClient,
  category: SavedCategory,
  userId: string,
  item: SavableItem,
  adoptedFrom?: string | null,
) {
  const { data: topRow } = await supabase
    .from(category)
    .select("position")
    .eq("user_id", userId)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const nextPosition = (topRow?.position ?? 0) - 1;

  return supabase.from(category).upsert(
    {
      user_id: userId,
      item_id: item.itemId,
      media_type: item.mediaType,
      title: item.title,
      image_url: item.imageUrl,
      metadata: { year: item.year },
      position: nextPosition,
      ...(adoptedFrom ? { adopted_from: adoptedFrom } : {}),
    },
    { onConflict: "user_id,item_id,media_type" },
  );
}

/**
 * Sets or clears the recommendation note on an already-saved item. Pass
 * `null` to delete the note.
 */
export async function updateNote(
  supabase: SupabaseClient,
  category: SavedCategory,
  userId: string,
  itemId: number,
  mediaType: "movie" | "tv",
  note: string | null,
) {
  return supabase
    .from(category)
    .update({ note })
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .eq("media_type", mediaType);
}

/**
 * Toggles the "Favorit" star on an Empfohlen-list (top_list) entry.
 * Favoriting is a top_list-only concept -- watchlist/dont_watch have no
 * star. Setting favorited_at to now() on every favorite (and clearing it on
 * unfavorite) is what drives "newest star first" sorting; see
 * app/api/category-items/route.ts.
 */
export async function setFavorite(
  supabase: SupabaseClient,
  userId: string,
  itemId: number,
  mediaType: "movie" | "tv",
  isFavorite: boolean,
) {
  return supabase
    .from("top_list")
    .update({
      is_favorite: isFavorite,
      favorited_at: isFavorite ? new Date().toISOString() : null,
    })
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .eq("media_type", mediaType);
}

export async function removeFromCategory(
  supabase: SupabaseClient,
  category: SavedCategory,
  userId: string,
  itemId: number,
  mediaType: "movie" | "tv",
) {
  return supabase
    .from(category)
    .delete()
    .eq("user_id", userId)
    .eq("item_id", itemId)
    .eq("media_type", mediaType);
}

/** "likes" is a lightweight table: no ranking, no position. */
export async function saveLike(
  supabase: SupabaseClient,
  userId: string,
  item: SavableItem,
) {
  return supabase.from("likes").upsert(
    {
      user_id: userId,
      item_id: item.itemId,
      media_type: item.mediaType,
      title: item.title,
      image_url: item.imageUrl,
      metadata: { year: item.year },
    },
    { onConflict: "user_id,item_id,media_type" },
  );
}
