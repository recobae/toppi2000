import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { Heart, Share2, Settings, Search, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { GuestProfileCta } from "@/components/profile/guest-profile-cta";
import { TrackLastVisitedProfile } from "@/components/profile/track-last-visited";
import { FollowButton } from "@/components/profile/follow-button";
import { ProfileCategorySections } from "@/components/profile/category-sections";
import { SAVED_CATEGORIES } from "@/lib/categories";

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

  const previewByCategory = await Promise.all(
    SAVED_CATEGORIES.map(async (category) => {
      const [{ data: previewRows }, { count }] = await Promise.all([
        supabase
          .from(category)
          .select("image_url")
          .eq("user_id", profile.id)
          .order("position", { ascending: true })
          .limit(4),
        supabase
          .from(category)
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id),
      ]);

      return {
        category,
        posterUrls: (previewRows ?? [])
          .map((row) => row.image_url)
          .filter((url): url is string => !!url),
        itemCount: count ?? 0,
      };
    }),
  );

  const topListPreview = previewByCategory.find((p) => p.category === "top_list");
  const likesCount = profile.total_likes_received ?? 0;

  const { count: followerCount } = await supabase
    .from("user_follows")
    .select("id", { count: "exact", head: true })
    .eq("followed_id", profile.id);

  type FollowingProfile = {
    id: string;
    username: string;
    avatarUrl: string | null;
  };

  let followingProfiles: FollowingProfile[] = [];
  if (isOwner) {
    const { data: followRows } = await supabase
      .from("user_follows")
      .select("followed_id")
      .eq("follower_id", profile.id);
    const followedIds = (followRows ?? []).map((row) => row.followed_id);

    if (followedIds.length > 0) {
      const [{ data: friendProfiles }, { data: friendTopListItems }] =
        await Promise.all([
          supabase.from("profiles").select("id, username").in("id", followedIds),
          supabase
            .from("top_list")
            .select("user_id, image_url")
            .in("user_id", followedIds)
            .order("position", { ascending: true }),
        ]);

      const avatarByUserId = new Map<string, string>();
      for (const item of friendTopListItems ?? []) {
        if (item.image_url && !avatarByUserId.has(item.user_id)) {
          avatarByUserId.set(item.user_id, item.image_url);
        }
      }

      followingProfiles = (friendProfiles ?? []).map((friend) => ({
        id: friend.id,
        username: friend.username,
        avatarUrl: avatarByUserId.get(friend.id) ?? null,
      }));
    }
  }

  const avatarUrl = topListPreview?.posterUrls[0] ?? null;

  const profileUrl = await getProfileUrl(profile.username);
  const shareText = `Schau dir ${profile.username}s Filmgeschmack an: ${profileUrl}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

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

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Heart className="size-4 fill-current text-red-500" />
            <span>{likesCount} erhaltene Likes</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="size-4" />
            <span>{followerCount ?? 0} Follower</span>
          </div>
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
          <div className="flex-1 flex flex-wrap items-center justify-center gap-2">
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
            {!isOwner && !isGuest && (
              <FollowButton
                targetUserId={profile.id}
                targetUsername={profile.username}
              />
            )}
            {isGuest && (
              <>
                <GuestProfileCta variant="button" />
                <FollowButton
                  targetUserId={profile.id}
                  targetUsername={profile.username}
                />
              </>
            )}
          </div>
        </div>

        <ProfileCategorySections
          username={profile.username}
          ownerId={profile.id}
          currentUserId={viewer?.id ?? null}
          previewByCategory={previewByCategory}
        />

        {isGuest && (
          <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-3">
            <GuestProfileCta variant="tile" />
          </div>
        )}

        {isOwner && (
          <div className="w-full flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">
              Ich folge
            </h2>
            {followingProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Du folgst noch niemandem.
              </p>
            ) : (
              <div className="w-full flex flex-wrap gap-4">
                {followingProfiles.map((friend) => (
                  <Link
                    key={friend.id}
                    href={`/u/${friend.username}`}
                    className="flex flex-col items-center gap-1.5 w-16"
                  >
                    <span className="rounded-full p-[3px] bg-[conic-gradient(from_0deg,#f97316,#ec4899,#8b5cf6,#3b82f6,#10b981,#f97316)]">
                      <span className="block rounded-full bg-background p-[3px]">
                        <ProfileAvatar
                          username={friend.username}
                          imageUrl={friend.avatarUrl}
                          size="sm"
                        />
                      </span>
                    </span>
                    <span className="text-[11px] text-center line-clamp-1 w-full">
                      {friend.username}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
