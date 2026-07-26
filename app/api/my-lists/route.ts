import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LIKES_LIST_TITLE } from "@/lib/lists";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { data: lists } = await supabase
    .from("lists")
    .select("id, title, category")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const movieList = (lists ?? []).find((list) => list.category === "movie");
  const tvList = (lists ?? []).find((list) => list.category === "tv");
  const watchlist = (lists ?? []).find(
    (list) => list.category === "watchlist" && list.title !== LIKES_LIST_TITLE,
  );
  const likesList = (lists ?? []).find(
    (list) => list.title === LIKES_LIST_TITLE && list.category === "watchlist",
  );

  return NextResponse.json({
    movieListId: movieList?.id ?? null,
    tvListId: tvList?.id ?? null,
    watchlistId: watchlist?.id ?? null,
    likesListId: likesList?.id ?? null,
  });
}
