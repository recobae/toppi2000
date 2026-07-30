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

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Orte-Suche ist nicht eingerichtet" }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ fromFriends: [], generic: [] });
  }

  const recommendations = await getCityPlaceRecommendations(supabase, user.id, city, apiKey);
  return NextResponse.json(recommendations);
}
