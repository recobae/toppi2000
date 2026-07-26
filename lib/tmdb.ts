const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const WATCH_PROVIDERS_REGION = "DE";

export type WatchProvider = {
  providerId: number;
  name: string;
  logoPath: string;
};

export type WatchProviderGroups = {
  flatrate: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
};

const EMPTY_WATCH_PROVIDERS: WatchProviderGroups = {
  flatrate: [],
  rent: [],
  buy: [],
};

type TmdbProviderEntry = {
  provider_id: number;
  provider_name: string;
  logo_path: string;
};

type TmdbWatchProvidersResponse = {
  results?: Record<
    string,
    {
      flatrate?: TmdbProviderEntry[];
      rent?: TmdbProviderEntry[];
      buy?: TmdbProviderEntry[];
    }
  >;
};

function mapEntries(entries: TmdbProviderEntry[] | undefined): WatchProvider[] {
  return (entries ?? []).map((entry) => ({
    providerId: entry.provider_id,
    name: entry.provider_name,
    logoPath: entry.logo_path,
  }));
}

export async function getWatchProviders(
  tmdbId: number,
  mediaType: "movie" | "tv",
  apiKey: string,
): Promise<WatchProviderGroups> {
  try {
    const url = new URL(
      `${TMDB_BASE_URL}/${mediaType}/${tmdbId}/watch/providers`,
    );
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return EMPTY_WATCH_PROVIDERS;

    const data: TmdbWatchProvidersResponse = await response.json();
    const region = data.results?.[WATCH_PROVIDERS_REGION];
    if (!region) return EMPTY_WATCH_PROVIDERS;

    return {
      flatrate: mapEntries(region.flatrate),
      rent: mapEntries(region.rent),
      buy: mapEntries(region.buy),
    };
  } catch {
    return EMPTY_WATCH_PROVIDERS;
  }
}

export async function getTrailerKey(
  tmdbId: number,
  mediaType: "movie" | "tv",
  apiKey: string,
): Promise<string | null> {
  try {
    const url = new URL(`${TMDB_BASE_URL}/${mediaType}/${tmdbId}/videos`);
    url.searchParams.set("api_key", apiKey);

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const data: {
      results?: { type: string; site: string; key: string }[];
    } = await response.json();

    const trailer = (data.results ?? []).find(
      (video) => video.type === "Trailer" && video.site === "YouTube",
    );

    return trailer?.key ?? null;
  } catch {
    return null;
  }
}

export type SearchResult = {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year: string | null;
  posterPath: string | null;
  overview: string;
  watchProviders: WatchProviderGroups;
};

export type PersonSummary = {
  id: number;
  name: string;
  profilePath: string | null;
};

export type TmdbTitleLike = {
  id: number;
  media_type: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  overview?: string;
  popularity?: number;
};

export async function buildSearchResults(
  items: TmdbTitleLike[],
  apiKey: string,
): Promise<SearchResult[]> {
  const filtered = items.filter(
    (item) => item.media_type === "movie" || item.media_type === "tv",
  );

  return Promise.all(
    filtered.map(async (item) => {
      const isMovie = item.media_type === "movie";
      const date = isMovie ? item.release_date : item.first_air_date;
      const mediaType = item.media_type as "movie" | "tv";
      const watchProviders = await getWatchProviders(
        item.id,
        mediaType,
        apiKey,
      );
      return {
        id: item.id,
        mediaType,
        title: (isMovie ? item.title : item.name) ?? "Unknown title",
        year: date ? date.slice(0, 4) : null,
        posterPath: item.poster_path,
        overview: item.overview ?? "",
        watchProviders,
      };
    }),
  );
}
