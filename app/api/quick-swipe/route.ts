import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getQuickSwipeQueue } from "@/lib/quick-swipe";
import { getSwipeQuota } from "@/lib/swipe-deck";

const PAGE_SIZE = 10;

/** Backs My Taste's Quick-Swipe deck -- the only content endpoint that surface uses. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const quota = await getSwipeQuota(supabase, user.id);
  if (quota.remaining === 0) {
    return NextResponse.json({ units: [], exhausted: true, remaining: 0 });
  }

  const excludeParam = request.nextUrl.searchParams.get("exclude") ?? "";
  const excludeIds = new Set(excludeParam.split(",").filter(Boolean));

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_city")
    .eq("id", user.id)
    .maybeSingle();

  const units = await getQuickSwipeQueue(supabase, user.id, {
    excludeIds,
    limit: quota.remaining !== null ? Math.min(PAGE_SIZE, quota.remaining) : PAGE_SIZE,
    homeCity: profile?.home_city ?? null,
    tmdbApiKey: process.env.TMDB_API_KEY,
    placesApiKey: process.env.GOOGLE_PLACES_API_KEY,
  });

  return NextResponse.json({ units, exhausted: units.length === 0, remaining: quota.remaining });
}
