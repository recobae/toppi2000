import { NextRequest, NextResponse } from "next/server";
import {
  buildSearchResults,
  type SearchResult,
  type TmdbTitleLike,
} from "@/lib/tmdb";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
// TMDb TV genre ids for "Talk" and "News" — no equivalent movie genres exist.
const EXCLUDED_GENRE_IDS = new Set([10767, 10763]);

const JOB_LABELS: Record<string, string> = {
  Director: "Regie",
  Writer: "Drehbuch",
  Screenplay: "Drehbuch",
  Story: "Story",
  Novel: "Vorlage",
  Producer: "Produzent",
  "Executive Producer": "Produzent",
  "Co-Producer": "Produzent",
  Creator: "Erfinder",
  "Director of Photography": "Kamera",
  Editor: "Schnitt",
  "Original Music Composer": "Musik",
  Composer: "Musik",
};

function labelForJob(job: string): string {
  return JOB_LABELS[job] ?? job;
}

type TmdbCreditItem = TmdbTitleLike & {
  popularity?: number;
  genre_ids?: number[];
  job?: string;
};

type MergedCreditItem = TmdbCreditItem & { jobs: string[] };

export type PersonCreditResult = SearchResult & { jobs: string[] };

export async function GET(request: NextRequest) {
  const personId = request.nextUrl.searchParams.get("personId");

  if (!personId) {
    return NextResponse.json(
      { error: "personId is required" },
      { status: 400 },
    );
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "TMDB_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const url = new URL(
    `${TMDB_BASE_URL}/person/${personId}/combined_credits`,
  );
  url.searchParams.set("api_key", apiKey);

  const tmdbResponse = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!tmdbResponse.ok) {
    return NextResponse.json(
      { error: "Failed to fetch person credits from TMDb" },
      { status: tmdbResponse.status },
    );
  }

  const data: { cast?: TmdbCreditItem[]; crew?: TmdbCreditItem[] } =
    await tmdbResponse.json();

  const isTitleCredit = (item: TmdbCreditItem) =>
    item.media_type === "movie" || item.media_type === "tv";

  const castItems = (data.cast ?? []).filter(isTitleCredit);
  const crewItems = (data.crew ?? []).filter(isTitleCredit);

  const merged = new Map<string, MergedCreditItem>();
  for (const item of castItems) {
    const key = `${item.media_type}-${item.id}`;
    if (!merged.has(key)) merged.set(key, { ...item, jobs: [] });
  }
  for (const item of crewItems) {
    const key = `${item.media_type}-${item.id}`;
    const job = labelForJob(item.job ?? "Crew");
    const existing = merged.get(key);
    if (existing) {
      if (!existing.jobs.includes(job)) existing.jobs.push(job);
    } else {
      merged.set(key, { ...item, jobs: [job] });
    }
  }

  const filtered = Array.from(merged.values()).filter((item) => {
    if (!item.poster_path) return false;
    const genreIds = item.genre_ids ?? [];
    if (genreIds.some((id) => EXCLUDED_GENRE_IDS.has(id))) return false;
    return true;
  });

  const sorted = filtered.sort(
    (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0),
  );

  const baseResults = await buildSearchResults(sorted, apiKey);
  const results: PersonCreditResult[] = baseResults.map((result, index) => ({
    ...result,
    jobs: sorted[index].jobs,
  }));

  return NextResponse.json({ results });
}
