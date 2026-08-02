import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { CategoryItemsGrid } from "@/components/lists/list-items-grid";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import {
  CATEGORY_LABELS,
  CATEGORY_PAGE_SUBTITLES,
  isSavedCategory,
  movieListHref,
} from "@/lib/categories";
import { getOwnInteractionRows } from "@/lib/taste-match";
import type { OwnInteractionEntry } from "@/lib/hooks/use-own-interactions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; category: string }>;
}): Promise<Metadata> {
  const { username, category } = await params;
  if (!isSavedCategory(category)) return { title: "Nicht gefunden" };
  return { title: `${CATEGORY_LABELS[category]} von ${username}` };
}

export default async function CategoryListPage({
  params,
}: {
  params: Promise<{ username: string; category: string }>;
}) {
  const { username, category } = await params;

  if (!isSavedCategory(category)) {
    notFound();
  }

  // Empfohlen and Watchlist now live together on one merged page -- old
  // links to either standalone list resolve there instead of 404ing.
  if (category === "top_list" || category === "watchlist") {
    redirect(movieListHref(username));
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", username)
    .single();

  if (!profile) {
    notFound();
  }

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

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
          <h1 className="font-medium text-xl">
            {CATEGORY_PAGE_SUBTITLES[category]}
          </h1>
        </div>
        <CategoryItemsGrid
          username={profile.username}
          category={category}
          ownerId={profile.id}
          currentUserId={viewer?.id ?? null}
          initialOwnInteractions={initialOwnInteractions}
        />
      </div>
      <ScrollToTopButton />
    </main>
  );
}
