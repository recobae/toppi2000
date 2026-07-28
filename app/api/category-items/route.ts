import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSavedCategory } from "@/lib/categories";
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

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  const category = request.nextUrl.searchParams.get("category");

  if (!username || !category || !isSavedCategory(category)) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", username)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const isOwner = viewer?.id === profile.id;

  const { data: rows, error } = await supabase
    .from(category)
    .select("id, item_id, media_type, title, image_url, metadata, position")
    .eq("user_id", profile.id)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const apiKey = process.env.TMDB_API_KEY;

  const items = await Promise.all(
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

      return {
        id: row.id,
        itemId: tmdbId,
        mediaType,
        title: row.title,
        imageUrl: row.image_url,
        year: (row.metadata as { year?: string | null } | null)?.year ?? null,
        watchProviders,
        movieDetails,
      };
    }),
  );

  return NextResponse.json({ items, isOwner, ownerId: profile.id });
}
