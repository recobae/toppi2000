import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSavedCategory } from "@/lib/categories";
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

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username");
  const category = request.nextUrl.searchParams.get("category");

  if (!username || !category || !isSavedCategory(category)) {
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
  // Enforced here, server-side -- the underlying tables are publicly
  // readable via RLS (same as every other list-entry column), so the
  // "followers"/"self" restriction only exists at this application layer.
  // Notes never reach the client response unless this check passes.
  const canViewNotes = await canViewOwnerNotes(supabase, {
    ownerId: profile.id,
    viewerId: viewer?.id ?? null,
    notesVisibility,
  });

  // Empfohlen (top_list) sorts favorites first (most recently starred on
  // top), then newest-first -- manual drag-reordering is hidden project-wide
  // now, so `position` no longer drives display order here. Other
  // categories keep the existing position order (unaffected by this round).
  // Two fully separate query chains (rather than a shared builder fed a
  // ternary select string) so each keeps its own literal select type.
  const { data: rows, error } =
    category === "top_list"
      ? await supabase
          .from(category)
          .select(
            "id, item_id, media_type, title, image_url, metadata, position, note, is_favorite, favorited_at, created_at",
          )
          .eq("user_id", profile.id)
          .order("is_favorite", { ascending: false })
          .order("favorited_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
      : await supabase
          .from(category)
          .select("id, item_id, media_type, title, image_url, metadata, position, note")
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
        note: canViewNotes ? (row.note ?? null) : null,
        watchProviders,
        movieDetails,
        isFavorite: "is_favorite" in row ? !!row.is_favorite : false,
      };
    }),
  );

  return NextResponse.json({ items, isOwner, ownerId: profile.id });
}
