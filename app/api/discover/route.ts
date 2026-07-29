import { NextRequest, NextResponse } from "next/server";
import {
  buildSearchResults,
  type SearchResult,
  type TmdbTitleLike,
} from "@/lib/tmdb";
import { createClient } from "@/lib/supabase/server";

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
  const [{ data: topListRows }, { data: likedRows }] = await Promise.all([
    supabase
      .from("top_list")
      .select("item_id, media_type")
      .eq("user_id", userId),
    supabase
      .from("item_interactions")
      .select("item_id, media_type")
      .eq("user_id", userId)
      .eq("interaction_type", "like")
      .in("media_type", ["movie", "tv"]),
  ]);

  const items = [...(topListRows ?? []), ...(likedRows ?? [])];
  const sample = items.slice(0, HISTORY_SAMPLE_LIMIT);
  if (sample.length === 0) return [];

  const genreCounts = new Map<number, number>();

  await Promise.all(
    sample.map(async (item) => {
      const mediaType = item.media_type;
      const tmdbId = Number(item.item_id);
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

// swiped_titles is no longer written to (see item_interactions), but old
// rows from before this migration still apply for their remaining 60-day
// window so a title doesn't reappear mid-way through someone's prior
// exclusion period.
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

// The generic, permanent successor: any like/dislike/skip in the new Inspo
// system keeps a title out of the algorithmic feed for good, not just 60
// days -- "skip" specifically exists for exactly this purpose.
async function getInteractionExcludedKeys(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("item_interactions")
    .select("item_id, media_type")
    .eq("user_id", userId)
    .in("media_type", ["movie", "tv"]);

  if (error || !data) return new Set();

  return new Set(data.map((row) => `${row.media_type}-${row.item_id}`));
}

const SAVED_ITEM_TABLES = ["likes", "top_list", "watchlist", "dont_watch"] as const;

async function getSavedItemKeys(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Set<string>> {
  const results = await Promise.all(
    SAVED_ITEM_TABLES.map((table) =>
      supabase
        .from(table)
        .select("item_id, media_type")
        .eq("user_id", userId),
    ),
  );

  const keys = new Set<string>();
  for (const { data } of results) {
    for (const row of data ?? []) {
      keys.add(`${row.media_type}-${row.item_id}`);
    }
  }
  return keys;
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

  const [inferredGenreIds, swipedKeys, interactionKeys, savedItemKeys] = await Promise.all([
    user ? getInferredGenreIds(supabase, user.id, apiKey) : Promise.resolve([]),
    user ? getRecentlySwipedKeys(supabase, user.id) : Promise.resolve(new Set<string>()),
    user ? getInteractionExcludedKeys(supabase, user.id) : Promise.resolve(new Set<string>()),
    user ? getSavedItemKeys(supabase, user.id) : Promise.resolve(new Set<string>()),
  ]);

  const excludedKeys = new Set([...swipedKeys, ...interactionKeys, ...savedItemKeys]);

  // TMDB's with_genres joins IDs with OR semantics, so mixing an active mood
  // filter with the user's unrelated inferred history genres would dilute
  // the mood filter instead of narrowing it. A selected mood takes precedence
  // and is used on its own; inferred genres only apply without a mood.
  const genreIds =
    moodGenreIds.length > 0
      ? moodGenreIds
      : Array.from(new Set(inferredGenreIds));

  const [poolAMovie, poolATv, poolBMovie, poolBTv] = await Promise.all([
    fetchPool("movie", genreIds, page, apiKey, "trending"),
    fetchPool("tv", genreIds, page, apiKey, "trending"),
    fetchPool("movie", genreIds, page, apiKey, "classic"),
    fetchPool("tv", genreIds, page, apiKey, "classic"),
  ]);

  const notExcluded = (item: TmdbTitleLike) =>
    !excludedKeys.has(`${item.media_type}-${item.id}`);

  const poolA = dedupeByKey(shuffle([...poolAMovie, ...poolATv])).filter(
    notExcluded,
  );
  const poolASeen = new Set(poolA.map((item) => `${item.media_type}-${item.id}`));
  const poolB = dedupeByKey(shuffle([...poolBMovie, ...poolBTv]))
    .filter(notExcluded)
    .filter((item) => !poolASeen.has(`${item.media_type}-${item.id}`));

  const targetACount = Math.min(poolA.length, Math.round(TARGET_TOTAL * POOL_A_SHARE));
  const targetBCount = Math.min(poolB.length, TARGET_TOTAL - targetACount);

  const merged = shuffle([
    ...poolA.slice(0, targetACount),
    ...poolB.slice(0, targetBCount),
  ]);

  const results: SearchResult[] = await buildSearchResults(merged, apiKey);

  return NextResponse.json({ results });
}
