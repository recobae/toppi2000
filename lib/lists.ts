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
