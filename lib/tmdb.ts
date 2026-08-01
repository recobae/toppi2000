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

export type CastMember = {
  id: number;
  name: string;
  profilePath: string | null;
};

export type DirectorInfo = {
  id: number;
  name: string;
};

export type MovieDetails = {
  voteAverage: number | null;
  genres: string[];
  runtimeMinutes: number | null;
  overview: string;
  cast: CastMember[];
  director: DirectorInfo | null;
  ageRating: string | null;
};

const EMPTY_MOVIE_DETAILS: MovieDetails = {
  voteAverage: null,
  genres: [],
  runtimeMinutes: null,
  overview: "",
  cast: [],
  director: null,
  ageRating: null,
};

const AGE_RATING_REGIONS = ["DE", "US"];

type TmdbGenre = { id: number; name: string };
type TmdbCastMember = { id: number; name: string; profile_path: string | null };
type TmdbCrewMember = { id: number; name: string; job: string };

type TmdbMovieDetailsResponse = {
  vote_average?: number;
  runtime?: number | null;
  episode_run_time?: number[];
  overview?: string;
  genres?: TmdbGenre[];
  credits?: { cast?: TmdbCastMember[]; crew?: TmdbCrewMember[] };
  created_by?: { id: number; name: string }[];
  release_dates?: {
    results?: {
      iso_3166_1: string;
      release_dates: { certification: string }[];
    }[];
  };
  content_ratings?: {
    results?: { iso_3166_1: string; rating: string }[];
  };
};

export async function getMovieDetails(
  tmdbId: number,
  mediaType: "movie" | "tv",
  apiKey: string,
): Promise<MovieDetails> {
  try {
    const url = new URL(`${TMDB_BASE_URL}/${mediaType}/${tmdbId}`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set(
      "append_to_response",
      mediaType === "movie" ? "credits,release_dates" : "credits,content_ratings",
    );

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return EMPTY_MOVIE_DETAILS;

    const data: TmdbMovieDetailsResponse = await response.json();

    const genres = (data.genres ?? []).slice(0, 2).map((genre) => genre.name);

    const runtimeMinutes =
      mediaType === "movie"
        ? (data.runtime ?? null)
        : (data.episode_run_time?.[0] ?? null);

    const cast = (data.credits?.cast ?? []).slice(0, 3).map((member) => ({
      id: member.id,
      name: member.name,
      profilePath: member.profile_path,
    }));

    const directorCredit =
      (data.credits?.crew ?? []).find((member) => member.job === "Director") ??
      data.created_by?.[0];
    const director: DirectorInfo | null = directorCredit
      ? { id: directorCredit.id, name: directorCredit.name }
      : null;

    let ageRating: string | null = null;
    if (mediaType === "movie") {
      const results = data.release_dates?.results ?? [];
      for (const region of AGE_RATING_REGIONS) {
        const match = results.find((entry) => entry.iso_3166_1 === region);
        const certification = match?.release_dates.find(
          (release) => release.certification,
        )?.certification;
        if (certification) {
          ageRating = certification;
          break;
        }
      }
    } else {
      const results = data.content_ratings?.results ?? [];
      for (const region of AGE_RATING_REGIONS) {
        const match = results.find((entry) => entry.iso_3166_1 === region);
        if (match?.rating) {
          ageRating = match.rating;
          break;
        }
      }
    }

    return {
      voteAverage: data.vote_average ?? null,
      genres,
      runtimeMinutes,
      overview: data.overview ?? "",
      cast,
      director,
      ageRating,
    };
  } catch {
    return EMPTY_MOVIE_DETAILS;
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
  movieDetails: MovieDetails;
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

export type TitleMatch = {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year: string | null;
  posterPath: string | null;
};

/**
 * Best-effort single match for a free-text title, used by the import flow
 * (lib/import-extract.ts's line-split names, or vision-extracted names from
 * a screenshot) -- deliberately lighter than buildSearchResults, which also
 * fetches watch providers/details per item; the import preview only needs
 * enough to render a row and later save it via the normal saveToCategory
 * flow once the user confirms.
 */
export async function searchBestTitleMatch(
  query: string,
  apiKey: string,
): Promise<TitleMatch | null> {
  try {
    const url = new URL(`${TMDB_BASE_URL}/search/multi`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("query", query);
    url.searchParams.set("include_adult", "false");

    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;

    const data: { results?: TmdbTitleLike[] } = await response.json();
    const best = (data.results ?? []).find(
      (item) => item.media_type === "movie" || item.media_type === "tv",
    );
    if (!best) return null;

    const isMovie = best.media_type === "movie";
    const date = isMovie ? best.release_date : best.first_air_date;

    return {
      id: best.id,
      mediaType: best.media_type as "movie" | "tv",
      title: (isMovie ? best.title : best.name) ?? query,
      year: date ? date.slice(0, 4) : null,
      posterPath: best.poster_path,
    };
  } catch {
    return null;
  }
}

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
      const [watchProviders, movieDetails] = await Promise.all([
        getWatchProviders(item.id, mediaType, apiKey),
        getMovieDetails(item.id, mediaType, apiKey),
      ]);
      return {
        id: item.id,
        mediaType,
        title: (isMovie ? item.title : item.name) ?? "Unknown title",
        year: date ? date.slice(0, 4) : null,
        posterPath: item.poster_path,
        overview: item.overview ?? "",
        watchProviders,
        movieDetails,
      };
    }),
  );
}
