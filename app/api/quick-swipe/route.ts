import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getQuickSwipeQueue } from "@/lib/quick-swipe";

const PAGE_SIZE = 10;

/**
 * Backs My Taste's Quick-Swipe deck -- the only content endpoint that
 * surface uses. Unlimited: no daily quota anymore (Master-Audit round --
 * the previous 20-cards/24h cap was removed project-wide), so this always
 * tries for a full page and only reports "exhausted" when the mixer
 * genuinely has nothing left to offer (no candidates, not "limit reached").
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
  const debug = request.nextUrl.searchParams.get("debug") === "1";

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_city")
    .eq("id", user.id)
    .maybeSingle();

  const { units, mixDebug } = await getQuickSwipeQueue(supabase, user.id, {
    excludeIds,
    limit: PAGE_SIZE,
    homeCity: profile?.home_city ?? null,
    tmdbApiKey: process.env.TMDB_API_KEY,
    placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
  });

  if (debug) console.info("[quick-swipe] mix", mixDebug);

  return NextResponse.json({ units, exhausted: units.length === 0, ...(debug ? { mixDebug } : {}) });
}
