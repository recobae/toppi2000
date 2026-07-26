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
const TALK_SHOW_GENRE_ID = "10767";
const SWIPED_RETENTION_DAYS = 60;
const POOL_A_SHARE = 0.6;
const TARGET_TOTAL = 30;

const MOOD_GENRES: Record<string, string[]> = {
  lustig: ["35"],
  spannend: ["53", "28"],
  gruselig: ["27"],
  herzerwaermend: ["18", "10749"],
  nachdenken: ["18", "9648"],
  episch: ["878", "14", "12"],
};

function fiveYearsAgoIso(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 5);
  return date.toISOString().slice(0, 10);
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function fetchDiscoverPage(
  mediaType: "movie" | "tv",
  genreIds: string[],
  page: number,
  apiKey: string,
  extraParams: Record<string, string>,
): Promise<TmdbTitleLike[]> {
  const url = new URL(`${TMDB_BASE_URL}/discover/${mediaType}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("page", String(page));

  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, value);
  }

  if (genreIds.length > 0) {
    url.searchParams.set("with_genres", genreIds.join("|"));
  }

  if (mediaType === "tv") {
    url.searchParams.set("without_genres", TALK_SHOW_GENRE_ID);
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

async function fetchPool(
  mediaType: "movie" | "tv",
  genreIds: string[],
  page: number,
  apiKey: string,
  pool: "trending" | "classic",
): Promise<TmdbTitleLike[]> {
  if (pool === "trending") {
    const dateField =
      mediaType === "movie" ? "primary_release_date.gte" : "first_air_date.gte";
    return fetchDiscoverPage(mediaType, genreIds, page, apiKey, {
      sort_by: "popularity.desc",
      [dateField]: fiveYearsAgoIso(),
    });
  }

  return fetchDiscoverPage(mediaType, genreIds, page, apiKey, {
    sort_by: "vote_average.desc",
    "vote_count.gte": "1000",
  });
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

async function getRecentlySwipedKeys(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Set<string>> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - SWIPED_RETENTION_DAYS);

  const { data, error } = await supabase
    .from("swiped_titles")
    .select("tmdb_id, media_type")
    .eq("user_id", userId)
    .gte("swiped_at", cutoff.toISOString());

  if (error || !data) return new Set();

  return new Set(data.map((row) => `${row.media_type}-${row.tmdb_id}`));
}

function dedupeByKey(items: TmdbTitleLike[]): TmdbTitleLike[] {
  const seen = new Set<string>();
  const result: TmdbTitleLike[] = [];
  for (const item of items) {
    const key = `${item.media_type}-${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
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

  const [inferredGenreIds, swipedKeys] = await Promise.all([
    user ? getInferredGenreIds(supabase, user.id, apiKey) : Promise.resolve([]),
    user ? getRecentlySwipedKeys(supabase, user.id) : Promise.resolve(new Set<string>()),
  ]);

  const genreIds = Array.from(new Set([...moodGenreIds, ...inferredGenreIds]));

  const [poolAMovie, poolATv, poolBMovie, poolBTv] = await Promise.all([
    fetchPool("movie", genreIds, page, apiKey, "trending"),
    fetchPool("tv", genreIds, page, apiKey, "trending"),
    fetchPool("movie", genreIds, page, apiKey, "classic"),
    fetchPool("tv", genreIds, page, apiKey, "classic"),
  ]);

  const poolA = dedupeByKey(shuffle([...poolAMovie, ...poolATv]));
  const poolASeen = new Set(poolA.map((item) => `${item.media_type}-${item.id}`));
  const poolB = dedupeByKey(shuffle([...poolBMovie, ...poolBTv])).filter(
    (item) => !poolASeen.has(`${item.media_type}-${item.id}`),
  );

  const targetACount = Math.min(poolA.length, Math.round(TARGET_TOTAL * POOL_A_SHARE));
  const targetBCount = Math.min(poolB.length, TARGET_TOTAL - targetACount);

  const merged = shuffle([
    ...poolA.slice(0, targetACount),
    ...poolB.slice(0, targetBCount),
  ]).filter((item) => !swipedKeys.has(`${item.media_type}-${item.id}`));

  const results: SearchResult[] = await buildSearchResults(merged, apiKey);

  return NextResponse.json({ results });
}
