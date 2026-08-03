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
  previewUrl?: string;
};

export type SongResult = {
  id: string;
  title: string;
  artist: string | null;
  artworkUrl: string | null;
  previewUrl: string;
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

/**
 * Full result list for a song search UI (favorite-song-snippet feature),
 * as opposed to searchBestMediaMatch's single best guess for auto-
 * classification. Only tracks with a previewUrl are kept -- without one
 * there'd be nothing to play, so they're not worth offering as a choice.
 */
export async function searchSongs(query: string, limit = 12): Promise<SongResult[]> {
  const term = query.trim();
  if (!term) return [];

  try {
    const url = new URL(ITUNES_SEARCH_URL);
    url.searchParams.set("term", term);
    url.searchParams.set("media", "music");
    url.searchParams.set("entity", "song");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("country", "DE");

    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return [];

    const data: { results?: ItunesResult[] } = await response.json();
    return (data.results ?? [])
      .filter((result): result is ItunesResult & { trackId: number; previewUrl: string } =>
        result.trackId !== undefined && !!result.previewUrl,
      )
      .map((result) => ({
        id: String(result.trackId),
        title: result.trackName ?? term,
        artist: result.artistName ?? null,
        artworkUrl: result.artworkUrl100 ? result.artworkUrl100.replace("100x100", "300x300") : null,
        previewUrl: result.previewUrl,
      }));
  } catch {
    return [];
  }
}
