export type PredefinedListOption = {
  title: string;
  category: "movie" | "tv";
};

export const PREDEFINED_LIST_OPTIONS: PredefinedListOption[] = [
  { title: "Overrated Movies", category: "movie" },
  { title: "Overrated Shows", category: "tv" },
  { title: "Hidden Gems Movies", category: "movie" },
  { title: "Hidden Gems Shows", category: "tv" },
];

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
