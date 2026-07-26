export type PredefinedListOption = {
  title: string;
  category: "movie" | "tv" | "watchlist";
};

export const PREDEFINED_LIST_OPTIONS: PredefinedListOption[] = [
  { title: "Overrated Movies", category: "movie" },
  { title: "Overrated Shows", category: "tv" },
  { title: "Hidden Gems Movies", category: "movie" },
  { title: "Hidden Gems Shows", category: "tv" },
];

// The "Gefällt mir" list is created lazily on the very first right-swipe in
// /vorschlag. It uses the "watchlist" category so it can hold both movies
// and tv shows, matching filterListsForMediaType's existing rule that
// watchlist-category lists accept either media type.
export const LIKES_LIST_TITLE = "Gefällt mir";
export const LIKES_LIST_CATEGORY = "watchlist" as const;

export function getListSocialTitle(
  category: string,
  listTitle: string,
  username: string,
): string {
  switch (category) {
    case "movie":
      return `Lieblingsfilme von ${username}`;
    case "tv":
      return `Lieblingsserien von ${username}`;
    case "watchlist":
      return `Was sagst du zur Watchlist von ${username}?`;
    default:
      return `${listTitle} von ${username}`;
  }
}
