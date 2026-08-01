import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewOwnerNotes, isNotesVisibility } from "@/lib/notes";
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

type MovieListStatus = "top_list" | "watchlist";

type Row = {
  id: string;
  item_id: number;
  media_type: string;
  title: string;
  image_url: string | null;
  metadata: { year?: string | null } | null;
  note: string | null;
  created_at: string;
  is_favorite?: boolean;
};

/**
 * Backs the merged Empfohlen+Watchlist view (/u/[username]/filme): reads
 * both tables and returns one deduplicated list, each item tagged with which
 * table it came from. If the same title somehow sits in both tables at once,
 * the top_list (Empfohlen) row wins and the watchlist duplicate is dropped --
 * Empfohlen is the "stronger" status.
 */
export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, notes_visibility")
    .eq("username", username)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const isOwner = viewer?.id === profile.id;

  const notesVisibility = isNotesVisibility(profile.notes_visibility)
    ? profile.notes_visibility
    : "all";
  const canViewNotes = await canViewOwnerNotes(supabase, {
    ownerId: profile.id,
    viewerId: viewer?.id ?? null,
    notesVisibility,
  });

  const [{ data: topListRows, error: topListError }, { data: watchlistRows, error: watchlistError }] =
    await Promise.all([
      supabase
        .from("top_list")
        .select("id, item_id, media_type, title, image_url, metadata, note, is_favorite, created_at")
        .eq("user_id", profile.id),
      supabase
        .from("watchlist")
        .select("id, item_id, media_type, title, image_url, metadata, note, created_at")
        .eq("user_id", profile.id),
    ]);

  if (topListError || watchlistError) {
    return NextResponse.json(
      { error: (topListError ?? watchlistError)!.message },
      { status: 500 },
    );
  }

  const seen = new Set<string>();
  const merged: { row: Row; status: MovieListStatus }[] = [];
  for (const row of (topListRows ?? []) as Row[]) {
    seen.add(`${row.media_type}-${row.item_id}`);
    merged.push({ row, status: "top_list" });
  }
  for (const row of (watchlistRows ?? []) as Row[]) {
    const key = `${row.media_type}-${row.item_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ row, status: "watchlist" });
  }

  const apiKey = process.env.TMDB_API_KEY;

  const items = await Promise.all(
    merged.map(async ({ row, status }) => {
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
        year: row.metadata?.year ?? null,
        note: canViewNotes ? (row.note ?? null) : null,
        watchProviders,
        movieDetails,
        isFavorite: status === "top_list" ? !!row.is_favorite : false,
        status,
        createdAt: row.created_at,
      };
    }),
  );

  return NextResponse.json({ items, isOwner, ownerId: profile.id });
}
