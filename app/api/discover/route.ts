import { NextRequest, NextResponse } from "next/server";
import {
  buildSearchResults,
  type SearchResult,
  type TmdbTitleLike,
} from "@/lib/tmdb";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const PAGES_TO_FETCH = 3;
const RESULT_LIMIT = 60;
const MIN_RESULTS_BEFORE_FALLBACK = 10;
const KIDS_AUDIENCE = "familie";
const KIDS_CERTIFICATION = "12";

const MOOD_GENRES: Record<string, string[]> = {
  lustig: ["35"],
  spannend: ["53", "28"],
  gruselig: ["27"],
  herzerwaermend: ["18", "10749"],
  nachdenken: ["18", "9648"],
  episch: ["878", "14", "12"],
};

type DiscoverAttempt = {
  mediaType: "movie" | "tv";
  genreIds: string[];
  providers: string | null;
  applyCertification: boolean;
};

function buildDiscoverUrl(
  attempt: DiscoverAttempt,
  apiKey: string,
  page: number,
): URL {
  const url = new URL(`${TMDB_BASE_URL}/discover/${attempt.mediaType}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("with_genres", attempt.genreIds.join("|"));
  url.searchParams.set("sort_by", "popularity.desc");
  url.searchParams.set("watch_region", "DE");
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("page", String(page));

  if (attempt.providers) {
    url.searchParams.set("with_watch_providers", attempt.providers);
  }

  if (attempt.applyCertification && attempt.mediaType === "movie") {
    url.searchParams.set("certification_country", "DE");
    url.searchParams.set("certification.lte", KIDS_CERTIFICATION);
  }

  return url;
}

async function fetchDiscoverPool(
  attempt: DiscoverAttempt,
  apiKey: string,
): Promise<TmdbTitleLike[]> {
  const pageNumbers = Array.from({ length: PAGES_TO_FETCH }, (_, i) => i + 1);

  const pages = await Promise.all(
    pageNumbers.map(async (page) => {
      const response = await fetch(buildDiscoverUrl(attempt, apiKey, page), {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return [];
      const data: { results: TmdbTitleLike[] } = await response.json();
      return data.results;
    }),
  );

  const seen = new Set<number>();
  const combined: TmdbTitleLike[] = [];
  for (const item of pages.flat()) {
    if (seen.has(item.id) || combined.length >= RESULT_LIMIT) continue;
    seen.add(item.id);
    combined.push({ ...item, media_type: attempt.mediaType });
  }

  return combined;
}

export async function GET(request: NextRequest) {
  const mediaTypeParam = request.nextUrl.searchParams.get("mediaType");
  const mood = request.nextUrl.searchParams.get("mood");
  const audience = request.nextUrl.searchParams.get("audience");
  const providers = request.nextUrl.searchParams.get("providers");

  if (mediaTypeParam !== "movie" && mediaTypeParam !== "tv") {
    return NextResponse.json(
      { error: "mediaType must be 'movie' or 'tv'" },
      { status: 400 },
    );
  }
  const mediaType: "movie" | "tv" = mediaTypeParam;

  const genreIds = mood ? MOOD_GENRES[mood] : undefined;
  if (!genreIds) {
    return NextResponse.json({ error: "Unknown mood" }, { status: 400 });
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const isKidsAudience = audience === KIDS_AUDIENCE;

  // Attempt 1: full filters (genres + providers + certification for kids).
  let pool = await fetchDiscoverPool(
    { mediaType, genreIds, providers, applyCertification: isKidsAudience },
    apiKey,
  );

  // Attempt 2: too few results — drop the streaming-provider requirement.
  if (pool.length < MIN_RESULTS_BEFORE_FALLBACK && providers) {
    pool = await fetchDiscoverPool(
      {
        mediaType,
        genreIds,
        providers: null,
        applyCertification: isKidsAudience,
      },
      apiKey,
    );
  }

  // Attempt 3: still too few for a kids audience — also drop the certification cap.
  if (pool.length < MIN_RESULTS_BEFORE_FALLBACK && isKidsAudience) {
    pool = await fetchDiscoverPool(
      { mediaType, genreIds, providers: null, applyCertification: false },
      apiKey,
    );
  }

  const results: SearchResult[] = await buildSearchResults(pool, apiKey);

  return NextResponse.json({ results });
}
