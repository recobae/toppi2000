const ITUNES_SEARCH_URL = "https://itunes.apple.com/search";

export type MediaMatch = {
  id: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
};

type ItunesResult = {
  trackId?: number;
  collectionId?: number;
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  artworkUrl100?: string;
};

const ITUNES_PARAMS: Record<"music" | "podcast", { media: string; entity: string }> = {
  music: { media: "music", entity: "song" },
  podcast: { media: "podcast", entity: "podcast" },
};

/**
 * Best-effort single match for a music track or podcast show, following the
 * same shape as lib/tmdb.ts's searchBestTitleMatch. The public iTunes
 * Search API needs no API key at all.
 */
export async function searchBestMediaMatch(
  title: string,
  subtype: "music" | "podcast",
): Promise<MediaMatch | null> {
  try {
    const { media, entity } = ITUNES_PARAMS[subtype];
    const url = new URL(ITUNES_SEARCH_URL);
    url.searchParams.set("term", title);
    url.searchParams.set("media", media);
    url.searchParams.set("entity", entity);
    url.searchParams.set("limit", "1");
    url.searchParams.set("country", "DE");

    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;

    const data: { results?: ItunesResult[] } = await response.json();
    const best = data.results?.[0];
    if (!best) return null;

    const id = best.trackId ?? best.collectionId;
    if (id === undefined) return null;

    return {
      id: String(id),
      title: best.trackName ?? best.collectionName ?? title,
      artist: best.artistName ?? null,
      artworkUrl: best.artworkUrl100 ? best.artworkUrl100.replace("100x100", "300x300") : null,
    };
  } catch {
    return null;
  }
}
