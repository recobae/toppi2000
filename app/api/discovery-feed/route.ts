import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDiscoveryFeed } from "@/lib/discovery";

const PAGE_SIZE = 8;

/**
 * Backs the "Für Dich" carousel stream. Stateless per request -- the client
 * sends every card id it has already seen this session via `exclude`, and
 * this re-gathers + re-ranks the full candidate pool each time rather than
 * tracking a server-side cursor. The dataset (one user's follow graph) is
 * small enough that this is simpler than pagination state, and it means a
 * new like/save from a friend can appear on the very next fetch.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const excludeParam = request.nextUrl.searchParams.get("exclude") ?? "";
  const excludeIds = new Set(excludeParam.split(",").filter(Boolean));

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_city")
    .eq("id", user.id)
    .maybeSingle();

  const { candidates, hasNetworkContent } = await getDiscoveryFeed(supabase, user.id, {
    excludeIds,
    limit: PAGE_SIZE,
    homeCity: profile?.home_city ?? null,
    tmdbApiKey: process.env.TMDB_API_KEY,
    placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
  });

  return NextResponse.json({
    results: candidates,
    exhausted: candidates.length === 0,
    hasNetworkContent,
  });
}
