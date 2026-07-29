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

// "dont_watch" stays the internal key (matches the DB table name) -- only
// the user-facing label changed from "Don't Watch" to "Overrated".
export const CATEGORY_LABELS: Record<SavedCategory, string> = {
  top_list: "Top-Liste",
  watchlist: "Watchlist",
  dont_watch: "Overrated",
};

// Subheading shown on the full-page list view (app/u/[username]/[category]).
export const CATEGORY_PAGE_SUBTITLES: Record<SavedCategory, string> = {
  top_list: "Meine Top Filme & Serien",
  watchlist: "Meine Watchlist",
  dont_watch: "Absoluter Schrott",
};

export const CATEGORY_ACTION_LABELS: Record<SavedCategory, string> = {
  top_list: "Top List",
  watchlist: "Watchlist",
  dont_watch: "Overrated",
};

export function isSavedCategory(value: string): value is SavedCategory {
  return (SAVED_CATEGORIES as string[]).includes(value);
}

// "Overrated" (dont_watch) is hidden from the UI -- no entry points create
// or surface it anymore, but the table/route/data stay fully intact for a
// possible later reactivation. Every UI surface that used to iterate
// SAVED_CATEGORIES (profile tiles, save buttons, swipe-card actions) should
// iterate this instead; direct links to an existing dont_watch list still
// resolve normally since the underlying route is untouched.
export const VISIBLE_SAVED_CATEGORIES: SavedCategory[] = ["top_list", "watchlist"];

// One consistent icon per category, reused on the profile page (next to the
// list title) and on the 3 save buttons in the Inspiration feed.
export const CATEGORY_ICONS: Record<SavedCategory, LucideIcon> = {
  top_list: Star,
  watchlist: Eye,
  dont_watch: Ban,
};
