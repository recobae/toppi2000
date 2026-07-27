import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { Heart, Share2, Settings, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { ListTile } from "@/components/profile/list-tile";
import { CreateListTile } from "@/components/profile/create-list-tile";
import { GuestProfileCta } from "@/components/profile/guest-profile-cta";
import { TrackLastVisitedProfile } from "@/components/profile/track-last-visited";

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
    .select("id, username, total_likes_received")
    .eq("username", username)
    .single();

  if (!profile) {
    notFound();
  }

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const isOwner = viewer?.id === profile.id;
  const isGuest = !viewer;

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

  const likesCount = profile.total_likes_received ?? 0;

  const statsByList = new Map<
    string,
    { count: number; posterUrls: string[]; topItemsSeen: number }
  >();
  for (const item of items ?? []) {
    const existing = statsByList.get(item.list_id);
    if (existing) {
      existing.count += 1;
      if (existing.topItemsSeen < 4) {
        existing.topItemsSeen += 1;
        if (item.image_url) existing.posterUrls.push(item.image_url);
      }
    } else {
      statsByList.set(item.list_id, {
        count: 1,
        posterUrls: item.image_url ? [item.image_url] : [],
        topItemsSeen: 1,
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
    ? (statsByList.get(movieList.id)?.posterUrls[0] ?? null)
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
      <TrackLastVisitedProfile username={profile.username} />
      <div className="flex-1 w-full flex flex-col items-center gap-6 max-w-2xl p-5 pt-10">
        <Link
          href="/vorschlag"
          aria-label="Zur Inspiration"
          className="rounded-full p-[3px] bg-[conic-gradient(from_0deg,#f97316,#ec4899,#8b5cf6,#3b82f6,#10b981,#f97316)]"
        >
          <span className="block rounded-full bg-background p-[3px]">
            <ProfileAvatar username={profile.username} imageUrl={avatarUrl} />
          </span>
        </Link>

        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold text-center">
            {profile.username}
          </h1>
          {isOwner && (
            <Link
              href="/settings"
              aria-label="Einstellungen"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings className="size-4" />
            </Link>
          )}
        </div>

        <p className="text-sm text-muted-foreground text-center">
          {movieCount} Filme · {tvCount} Serien · {watchlistCount} auf der
          Watchlist
        </p>

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Heart className="size-4 fill-current text-red-500" />
          <span>{likesCount} erhaltene Likes</span>
        </div>

        <div className="w-full flex items-center gap-3">
          <Link
            href="/search"
            aria-label="Suche"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-accent transition-colors min-h-11"
          >
            <Search className="size-4" />
            Suche
          </Link>
          <div className="flex-1 flex justify-center">
            {isOwner && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-medium px-4 py-2 hover:bg-primary/90 transition-colors min-h-11"
              >
                <Share2 className="size-4" />
                Profil teilen
              </a>
            )}
            {isGuest && <GuestProfileCta variant="button" />}
          </div>
        </div>

        <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-3">
          {standardOrder.map(({ list, category }) =>
            list ? (
              <ListTile
                key={list.id}
                listId={list.id}
                label={STANDARD_LABELS[category]}
                posterUrls={statsByList.get(list.id)?.posterUrls ?? []}
                itemCount={statsByList.get(list.id)?.count ?? 0}
              />
            ) : null,
          )}
          {customLists.map((list) => (
            <ListTile
              key={list.id}
              listId={list.id}
              label={list.title}
              posterUrls={statsByList.get(list.id)?.posterUrls ?? []}
              itemCount={statsByList.get(list.id)?.count ?? 0}
            />
          ))}
          {isOwner && (
            <CreateListTile
              existingTitles={(lists ?? []).map((list) => list.title)}
            />
          )}
          {isGuest && <GuestProfileCta variant="tile" />}
        </div>

        {publicLists.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {profile.username} hat noch keine öffentlichen Listen.
          </p>
        )}
      </div>
    </main>
  );
}
