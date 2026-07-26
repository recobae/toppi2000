import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { Heart, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { ListTile } from "@/components/profile/list-tile";
import { CreateListTile } from "@/components/profile/create-list-tile";

const STANDARD_LABELS: Record<string, string> = {
  movie: "Lieblingsfilme",
  tv: "Lieblingsserien",
  watchlist: "Watchlist",
};

async function getProfileUrl(username: string): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}/u/${username}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `Profil von ${username}` };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
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

  const { data: lists } = await supabase
    .from("lists")
    .select("id, title, category, is_public")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: true });

  const publicLists = (lists ?? []).filter((list) => list.is_public);
  const listIds = publicLists.map((list) => list.id);

  const { data: items } =
    listIds.length > 0
      ? await supabase
          .from("list_items")
          .select("id, list_id, position, image_url")
          .in("list_id", listIds)
          .order("position", { ascending: true })
      : { data: [] };

  const itemIds = (items ?? []).map((item) => item.id);

  const { count: likesCount } =
    itemIds.length > 0
      ? await supabase
          .from("item_votes")
          .select("id", { count: "exact", head: true })
          .eq("vote", true)
          .neq("user_id", profile.id)
          .in("list_item_id", itemIds)
      : { count: 0 };

  const statsByList = new Map<
    string,
    { count: number; posterUrl: string | null }
  >();
  for (const item of items ?? []) {
    const existing = statsByList.get(item.list_id);
    if (existing) {
      existing.count += 1;
    } else {
      statsByList.set(item.list_id, {
        count: 1,
        posterUrl: item.image_url,
      });
    }
  }

  const movieList = publicLists.find((list) => list.category === "movie");
  const tvList = publicLists.find((list) => list.category === "tv");
  const watchlistList = publicLists.find(
    (list) => list.category === "watchlist",
  );
  const standardListIds = new Set(
    [movieList, tvList, watchlistList]
      .filter((list): list is NonNullable<typeof list> => !!list)
      .map((list) => list.id),
  );
  const customLists = publicLists.filter(
    (list) => !standardListIds.has(list.id),
  );

  const movieCount = movieList
    ? (statsByList.get(movieList.id)?.count ?? 0)
    : 0;
  const tvCount = tvList ? (statsByList.get(tvList.id)?.count ?? 0) : 0;
  const watchlistCount = watchlistList
    ? (statsByList.get(watchlistList.id)?.count ?? 0)
    : 0;

  const avatarUrl = movieList
    ? (statsByList.get(movieList.id)?.posterUrl ?? null)
    : null;

  const profileUrl = await getProfileUrl(profile.username);
  const shareText = `Schau dir ${profile.username}s Filmgeschmack an: ${profileUrl}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const standardOrder: { list: typeof movieList; category: string }[] = [
    { list: movieList, category: "movie" },
    { list: tvList, category: "tv" },
    { list: watchlistList, category: "watchlist" },
  ];

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center gap-6 max-w-2xl p-5 pt-10">
        <ProfileAvatar username={profile.username} imageUrl={avatarUrl} />

        <h1 className="text-xl font-semibold text-center">
          {profile.username}
        </h1>

        <p className="text-sm text-muted-foreground text-center">
          {movieCount} Filme · {tvCount} Serien · {watchlistCount} auf der
          Watchlist
        </p>

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Heart className="size-4 fill-current text-red-500" />
          <span>{likesCount ?? 0} erhaltene Likes</span>
        </div>

        <a
          href={whatsappHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition-colors min-h-11"
        >
          <Share2 className="size-4" />
          Profil teilen
        </a>

        <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-3">
          {standardOrder.map(({ list, category }) =>
            list ? (
              <ListTile
                key={list.id}
                listId={list.id}
                label={STANDARD_LABELS[category]}
                posterUrl={statsByList.get(list.id)?.posterUrl ?? null}
                itemCount={statsByList.get(list.id)?.count ?? 0}
              />
            ) : null,
          )}
          {customLists.map((list) => (
            <ListTile
              key={list.id}
              listId={list.id}
              label={list.title}
              posterUrl={statsByList.get(list.id)?.posterUrl ?? null}
              itemCount={statsByList.get(list.id)?.count ?? 0}
            />
          ))}
          {isOwner && (
            <CreateListTile
              existingTitles={(lists ?? []).map((list) => list.title)}
            />
          )}
        </div>

        {publicLists.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {profile.username} hat noch keine öffentlichen Listen.
          </p>
        )}

        <Link
          href="/search"
          className="text-xs text-muted-foreground hover:underline"
        >
          ← Zur Suche
        </Link>
      </div>
    </main>
  );
}
