import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGenreProfileMovieRecommendations } from "@/lib/recommendations";

/** Compact suggestion strip under a user's own Empfohlen-list. */
export async function GET() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "TMDB_API_KEY is not configured" }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ results: [] });
  }

  const results = await getGenreProfileMovieRecommendations(supabase, user.id, apiKey);
  return NextResponse.json({ results });
}
