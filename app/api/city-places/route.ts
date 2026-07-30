import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCityPlaceRecommendations } from "@/lib/recommendations";

/**
 * Backs both the Inspiration Orte tab's per-city feed and the compact
 * suggestion widget under a user's own Orte-region list -- same query
 * either way (see lib/recommendations.ts).
 */
export async function GET(request: NextRequest) {
  const city = request.nextUrl.searchParams.get("city");
  if (!city) {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(60, Math.max(1, parseInt(limitParam ?? "12", 10) || 12));

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Orte-Suche ist nicht eingerichtet" }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Guests still get the generic half of the feed -- only "friends who
  // added something here" needs an actual account/follow graph.
  const recommendations = await getCityPlaceRecommendations(
    supabase,
    user?.id ?? null,
    city,
    apiKey,
    limit,
  );
  return NextResponse.json(recommendations);
}
