import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ListItemsGrid, type ListItem } from "@/components/lists/list-items-grid";
import { ShareListButton } from "@/components/lists/share-list-button";
import {
  getWatchProviders,
  getMovieDetails,
  type WatchProviderGroups,
  type MovieDetails,
} from "@/lib/tmdb";
import { getListSocialTitle } from "@/lib/lists";
import { getListWithAccess } from "./get-list-access";

const EMPTY_WATCH_PROVIDERS: WatchProviderGroups = {
  flatrate: [],
  rent: [],
  buy: [],
};

const EMPTY_MOVIE_DETAILS: MovieDetails = {
  voteAverage: null,
  genres: [],
  runtimeMinutes: null,
  overview: "",
  cast: [],
  director: null,
  ageRating: null,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const access = await getListWithAccess(id);

  if (!access) {
    return { title: "Liste nicht gefunden" };
  }

  const title = getListSocialTitle(
    access.list.category,
    access.list.title,
    access.username,
  );

  return {
    title,
    openGraph: { title },
  };
}

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getListWithAccess(id);

  if (!access) {
    notFound();
  }

  const { list, isOwner, username, profileUsername } = access;
  const supabase = await createClient();

  const { data: items, error: itemsError } = await supabase
    .from("list_items")
    .select("id, external_id, title, image_url, list_id, position, metadata")
    .eq("list_id", id)
    .order("position", { ascending: true });

  if (itemsError) {
    throw new Error(itemsError.message);
  }

  const apiKey = process.env.TMDB_API_KEY;

  const itemsWithProviders: ListItem[] = await Promise.all(
    (items ?? []).map(async (item) => {
      const mediaType = item.metadata?.type;
      const tmdbId = Number(item.external_id);
      const canFetch = apiKey && mediaType && Number.isFinite(tmdbId);

      const [watchProviders, movieDetails] = await Promise.all([
        canFetch
          ? getWatchProviders(tmdbId, mediaType, apiKey)
          : Promise.resolve(EMPTY_WATCH_PROVIDERS),
        canFetch
          ? getMovieDetails(tmdbId, mediaType, apiKey)
          : Promise.resolve(EMPTY_MOVIE_DETAILS),
      ]);

      return { ...item, watchProviders, movieDetails } as ListItem;
    }),
  );

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-6 max-w-5xl p-5">
        <div className="flex flex-col gap-1 pt-8">
          <div className="flex items-center justify-between gap-2">
            <Link
              href={profileUsername ? `/u/${profileUsername}` : "/search"}
              className="text-sm text-muted-foreground hover:underline w-fit"
            >
              ← Zum Profil
            </Link>
            <ShareListButton shareTitle={`${list.title} von ${username}`} />
          </div>
          <h1 className="font-medium text-xl">
            {list.title} von{" "}
            {profileUsername ? (
              <Link href={`/u/${profileUsername}`} className="hover:underline">
                {username}
              </Link>
            ) : (
              username
            )}
          </h1>
        </div>
        <ListItemsGrid
          initialItems={itemsWithProviders}
          isOwner={isOwner}
          listId={id}
          ownerUsername={username}
        />
      </div>
    </main>
  );
}
