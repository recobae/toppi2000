import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { MovieListGrid } from "@/components/lists/movie-list-grid";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { MOVIE_LIST_LABEL } from "@/lib/categories";
import { getOwnInteractionRows } from "@/lib/taste-match";
import type { OwnInteractionEntry } from "@/lib/hooks/use-own-interactions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `${MOVIE_LIST_LABEL} von ${username}` };
}

export default async function MovieListPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: { user: viewer } }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .single(),
    supabase.auth.getUser(),
  ]);

  if (!profile) {
    notFound();
  }

  const isOwner = viewer?.id === profile.id;
  // Prefetched here (instead of inside useOwnInteractions on mount) since
  // this page already knows viewer.id -- only needed on someone else's
  // list, where the Ja/Nein buttons need to reflect the viewer's own
  // like/dislike immediately.
  let initialOwnInteractions: OwnInteractionEntry[] | undefined;
  if (!isOwner && viewer) {
    const rows = await getOwnInteractionRows(supabase, viewer.id);
    initialOwnInteractions = rows.map((row) => ({
      id: row.item_id,
      mediaType: row.media_type as OwnInteractionEntry["mediaType"],
      interactionType: row.interaction_type,
    }));
  }

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-6 max-w-5xl p-5">
        <div className="flex flex-col gap-1 pt-8">
          <Link
            href={`/u/${profile.username}`}
            className="text-sm text-muted-foreground hover:underline w-fit"
          >
            ← Zum Profil
          </Link>
          <h1 className="font-medium text-xl">{MOVIE_LIST_LABEL}</h1>
        </div>
        <MovieListGrid
          username={profile.username}
          ownerId={profile.id}
          currentUserId={viewer?.id ?? null}
          initialOwnInteractions={initialOwnInteractions}
        />
      </div>
      <ScrollToTopButton />
    </main>
  );
}
