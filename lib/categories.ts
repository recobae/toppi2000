import { Ban, Eye, Star, type LucideIcon } from "lucide-react";

// The 3 fixed, rankable collections every user has. Kept generic
// (item_id/media_type on the DB side, "category" here) so a future
// expansion to other kinds of items (music, places, ...) doesn't require
// renaming this layer.
export type SavedCategory = "top_list" | "watchlist" | "dont_watch";

export const SAVED_CATEGORIES: SavedCategory[] = [
  "top_list",
  "watchlist",
  "dont_watch",
];

export const CATEGORY_LABELS: Record<SavedCategory, string> = {
  top_list: "Top Filme & Shows",
  watchlist: "Watchlist",
  dont_watch: "Don't Watch",
};

export const CATEGORY_ACTION_LABELS: Record<SavedCategory, string> = {
  top_list: "Top List",
  watchlist: "Watchlist",
  dont_watch: "Don't Watch",
};

export function isSavedCategory(value: string): value is SavedCategory {
  return (SAVED_CATEGORIES as string[]).includes(value);
}

// One consistent icon per category, reused on the profile page (next to the
// list title) and on the 3 save buttons in the Inspiration feed.
export const CATEGORY_ICONS: Record<SavedCategory, LucideIcon> = {
  top_list: Star,
  watchlist: Eye,
  dont_watch: Ban,
};
