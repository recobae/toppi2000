import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildSearchResults, type SearchResult, type TmdbTitleLike } from "@/lib/tmdb";
import { getExcludedMovieKeys } from "@/lib/exclusions";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const CANDIDATE_LIMIT = 15;

export type AskAnswer = {
  result: SearchResult;
  reason: string;
  recommendedBy: string[];
};

/**
 * "Frag einfach..." overlay (Wireframe 3), scoped to the one concrete
 * example the spec actually gives: a movie/tv pick from friends' likes,
 * with a short reason. Candidates always come from real data (friends'
 * item_interactions likes) -- Claude only picks and explains from that
 * list, never invents a title, so a missing/misconfigured
 * ANTHROPIC_API_KEY degrades to "highest agreement first" instead of
 * failing the whole feature.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const tmdbApiKey = process.env.TMDB_API_KEY;
  if (!tmdbApiKey) {
    return NextResponse.json({ error: "TMDB_API_KEY is not configured" }, { status: 500 });
  }

  const body: { question?: string } = await request.json();
  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const { data: followRows } = await supabase
    .from("user_follows")
    .select("followed_id")
    .eq("follower_id", user.id);
  const followedIds = (followRows ?? []).map((row) => row.followed_id);
  if (followedIds.length === 0) {
    return NextResponse.json({ answer: null });
  }

  const [excludedKeys, { data: likedRows }, { data: profiles }] = await Promise.all([
    getExcludedMovieKeys(supabase, user.id),
    supabase
      .from("item_interactions")
      .select("item_id, media_type, user_id")
      .in("user_id", followedIds)
      .eq("interaction_type", "like")
      .in("media_type", ["movie", "tv"]),
    supabase.from("profiles").select("id, username").in("id", followedIds),
  ]);
  const usernameById = new Map((profiles ?? []).map((profile) => [profile.id, profile.username]));

  const byKey = new Map<string, { id: number; mediaType: "movie" | "tv"; likedBy: Set<string> }>();
  for (const row of likedRows ?? []) {
    const key = `${row.media_type}-${row.item_id}`;
    if (excludedKeys.has(key)) continue;
    const tmdbId = Number(row.item_id);
    if (!Number.isFinite(tmdbId)) continue;
    const username = usernameById.get(row.user_id);
    if (!username) continue;
    if (!byKey.has(key)) {
      byKey.set(key, { id: tmdbId, mediaType: row.media_type as "movie" | "tv", likedBy: new Set() });
    }
    byKey.get(key)!.likedBy.add(username);
  }

  const ranked = Array.from(byKey.values())
    .sort((a, b) => b.likedBy.size - a.likedBy.size)
    .slice(0, CANDIDATE_LIMIT);

  if (ranked.length === 0) {
    return NextResponse.json({ answer: null });
  }

  const candidateItems: TmdbTitleLike[] = ranked.map((entry) => ({
    id: entry.id,
    media_type: entry.mediaType,
    poster_path: null,
  }));
  const candidateResults = await buildSearchResults(candidateItems, tmdbApiKey);
  const recommendedByByKey = new Map(
    ranked.map((entry) => [`${entry.mediaType}-${entry.id}`, [...entry.likedBy]]),
  );

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  let chosenIndex = 0;
  let reason = "Von deinen Freunden geliked";

  if (anthropicApiKey) {
    const candidateList = candidateResults
      .map(
        (result, index) =>
          `${index}: "${result.title}" (${result.mediaType === "tv" ? "Serie" : "Film"}${
            result.movieDetails.genres.length > 0 ? ", " + result.movieDetails.genres.join("/") : ""
          }) -- geliked von ${recommendedByByKey.get(`${result.mediaType}-${result.id}`)?.join(", ")}`,
      )
      .join("\n");

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicApiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 200,
          messages: [
            {
              role: "user",
              content: `Ein Nutzer fragt: "${question}"\n\nWähle aus dieser Liste den am besten passenden Titel (antworte NUR mit dem Index):\n${candidateList}\n\nAntworte ausschließlich mit kompaktem JSON: {"index": <Zahl>, "reason": "<max. 12 Wörter, warum genau dieser Titel passt>"}`,
            },
          ],
        }),
      });
      if (response.ok) {
        const data: { content?: { type: string; text?: string }[] } = await response.json();
        const raw = (data.content ?? []).find((block) => block.type === "text")?.text ?? "";
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const parsed: { index?: number; reason?: string } = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
        if (typeof parsed.index === "number" && candidateResults[parsed.index]) {
          chosenIndex = parsed.index;
          reason = parsed.reason?.trim() || reason;
        }
      }
    } catch {
      // fall back to the highest-agreement candidate already selected above
    }
  }

  const chosen = candidateResults[chosenIndex];
  const answer: AskAnswer = {
    result: chosen,
    reason,
    recommendedBy: recommendedByByKey.get(`${chosen.mediaType}-${chosen.id}`) ?? [],
  };

  return NextResponse.json({ answer });
}
