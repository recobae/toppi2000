import { NextRequest, NextResponse } from "next/server";
import {
  buildSearchResults,
  type SearchResult,
  type TmdbTitleLike,
} from "@/lib/tmdb";
import { createClient } from "@/lib/supabase/server";
import { LIKES_LIST_TITLE } from "@/lib/lists";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const HISTORY_SAMPLE_LIMIT = 20;
const INFERRED_GENRE_LIMIT = 3;

const MOOD_GENRES: Record<string, string[]> = {
  lustig: ["35"],
  spannend: ["53", "28"],
  gruselig: ["27"],
  herzerwaermend: ["18", "10749"],
  nachdenken: ["18", "9648"],
  episch: ["878", "14", "12"],
};

async function fetchDiscoverPage(
  mediaType: "movie" | "tv",
  genreIds: string[],
  page: number,
  apiKey: string,
): Promise<TmdbTitleLike[]> {
  const url = new URL(`${TMDB_BASE_URL}/discover/${mediaType}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("sort_by", "popularity.desc");
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("page", String(page));

  if (genreIds.length > 0) {
    url.searchParams.set("with_genres", genreIds.join("|"));
  }

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return [];
    const data: { results: TmdbTitleLike[] } = await response.json();
    return data.results.map((item) => ({ ...item, media_type: mediaType }));
  } catch {
    return [];
  }
}

async function getInferredGenreIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  apiKey: string,
): Promise<string[]> {
  const [{ data: categoryLists }, { data: likesLists }] = await Promise.all([
    supabase
      .from("lists")
      .select("id")
      .eq("user_id", userId)
      .in("category", ["movie", "tv"]),
    supabase
      .from("lists")
      .select("id")
      .eq("user_id", userId)
      .eq("title", LIKES_LIST_TITLE),
  ]);

  const listIds = [
    ...(categoryLists ?? []).map((list) => list.id),
    ...(likesLists ?? []).map((list) => list.id),
  ];

  if (listIds.length === 0) return [];

  const { data: items } = await supabase
    .from("list_items")
    .select("external_id, metadata")
    .in("list_id", listIds);

  const sample = (items ?? []).slice(0, HISTORY_SAMPLE_LIMIT);
  if (sample.length === 0) return [];

  const genreCounts = new Map<number, number>();

  await Promise.all(
    sample.map(async (item) => {
      const mediaType = item.metadata?.type;
      const tmdbId = Number(item.external_id);
      if (
        (mediaType !== "movie" && mediaType !== "tv") ||
        !Number.isFinite(tmdbId)
      ) {
        return;
      }

      try {
        const url = new URL(`${TMDB_BASE_URL}/${mediaType}/${tmdbId}`);
        url.searchParams.set("api_key", apiKey);
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const data: { genres?: { id: number }[] } = await response.json();
        for (const genre of data.genres ?? []) {
          genreCounts.set(genre.id, (genreCounts.get(genre.id) ?? 0) + 1);
        }
      } catch {
        // ignore individual lookup failures
      }
    }),
  );

  return Array.from(genreCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, INFERRED_GENRE_LIMIT)
    .map(([id]) => String(id));
}

export async function GET(request: NextRequest) {
  const mood = request.nextUrl.searchParams.get("mood");
  const pageParam = request.nextUrl.searchParams.get("page");
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const moodGenreIds = mood && MOOD_GENRES[mood] ? MOOD_GENRES[mood] : [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const inferredGenreIds = user
    ? await getInferredGenreIds(supabase, user.id, apiKey)
    : [];

  const genreIds = Array.from(new Set([...moodGenreIds, ...inferredGenreIds]));

  const [movieItems, tvItems] = await Promise.all([
    fetchDiscoverPage("movie", genreIds, page, apiKey),
    fetchDiscoverPage("tv", genreIds, page, apiKey),
  ]);

  const merged = [...movieItems, ...tvItems].sort(
    (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0),
  );

  const results: SearchResult[] = await buildSearchResults(merged, apiKey);

  return NextResponse.json({ results });
}
