import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getWatchProviders,
  getMovieDetails,
  type WatchProviderGroups,
  type MovieDetails,
} from "@/lib/tmdb";

const EMPTY_WATCH_PROVIDERS: WatchProviderGroups = {
  flatrate: [],
  rent: [],
  buy: [],
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

const POSTER_BASE_URL = "https://image.tmdb.org/t/p/w342";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("likes")
    .select("item_id, media_type, title, image_url, metadata, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const apiKey = process.env.TMDB_API_KEY;

  const results = await Promise.all(
    (rows ?? []).map(async (row) => {
      const mediaType = row.media_type as "movie" | "tv";
      const tmdbId = Number(row.item_id);
      const canFetch = apiKey && Number.isFinite(tmdbId);

      const [watchProviders, movieDetails] = await Promise.all([
        canFetch
          ? getWatchProviders(tmdbId, mediaType, apiKey)
          : Promise.resolve(EMPTY_WATCH_PROVIDERS),
        canFetch
          ? getMovieDetails(tmdbId, mediaType, apiKey)
          : Promise.resolve(EMPTY_MOVIE_DETAILS),
      ]);

      const posterUrl: string | null = row.image_url ?? null;
      const posterPath =
        posterUrl && posterUrl.startsWith(POSTER_BASE_URL)
          ? posterUrl.slice(POSTER_BASE_URL.length)
          : null;

      return {
        id: tmdbId,
        mediaType,
        title: row.title,
        year: (row.metadata as { year?: string | null } | null)?.year ?? null,
        posterPath,
        overview: movieDetails.overview,
        watchProviders,
        movieDetails,
      };
    }),
  );

  return NextResponse.json({ results });
}
