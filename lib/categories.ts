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

// "top_list"/"dont_watch" stay the internal keys (match the DB table names)
// -- only the user-facing label changed ("Top-Liste" -> "Empfohlen",
// "Don't Watch" -> "Overrated"). Renaming the physical tables would touch
// every query in the project for no functional gain.
export const CATEGORY_LABELS: Record<SavedCategory, string> = {
  top_list: "Empfohlen",
  watchlist: "Watchlist",
  dont_watch: "Overrated",
};

// Subheading shown on the full-page list view (app/u/[username]/[category]).
export const CATEGORY_PAGE_SUBTITLES: Record<SavedCategory, string> = {
  top_list: "Meine Empfehlungen",
  watchlist: "Meine Watchlist",
  dont_watch: "Absoluter Schrott",
};

export const CATEGORY_ACTION_LABELS: Record<SavedCategory, string> = {
  top_list: "Empfohlen",
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

// Empfohlen (top_list) and Watchlist share a single browsing surface --
// /u/[username]/filme -- reading from both tables at once (see
// app/api/movie-list-items/route.ts). The tables themselves stay separate
// (favoriting, status-transition writes, credits all still target one table
// at a time); this is purely the merged read/display layer.
export const MOVIE_LIST_LABEL = "Filme & Serien";
export function movieListHref(username: string): string {
  return `/u/${username}/filme`;
}

// One consistent icon per category, reused on the profile page (next to the
// list title) and on the 3 save buttons in the Inspiration feed.
export const CATEGORY_ICONS: Record<SavedCategory, LucideIcon> = {
  top_list: Star,
  watchlist: Eye,
  dont_watch: Ban,
};
