import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { Heart, MapPin, Plus, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { ListTile } from "@/components/profile/list-tile";
import { GuestProfileCta } from "@/components/profile/guest-profile-cta";
import { TrackLastVisitedProfile } from "@/components/profile/track-last-visited";
import { FollowButton } from "@/components/profile/follow-button";
import { FollowingBar } from "@/components/profile/following-bar";
import { FollowerCount } from "@/components/profile/follower-count";
import { ShareListButton } from "@/components/lists/share-list-button";
import { ExpertiseBadges } from "@/components/profile/expertise-badges";
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  SAVED_CATEGORIES,
  type SavedCategory,
} from "@/lib/categories";
import { resolveEarnedExpertiseLabels, resolvePlaceExpertiseLabels } from "@/lib/expertise";

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

  const itemCountByCategory = Object.fromEntries(
    previewByCategory.map((entry) => [entry.category, entry.itemCount]),
  ) as Partial<Record<SavedCategory, number>>;

  const { data: regionRows } = await supabase
    .from("place_regions")
    .select("id, region_name, region_key")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: true });

  const regions = await Promise.all(
    (regionRows ?? []).map(async (region) => {
      const [{ data: previewRows }, { count }] = await Promise.all([
        supabase
          .from("places")
          .select("photo_url")
          .eq("region_id", region.id)
          .order("position", { ascending: true })
          .limit(4),
        supabase
          .from("places")
          .select("id", { count: "exact", head: true })
          .eq("region_id", region.id),
      ]);

      return {
        key: region.region_key,
        name: region.region_name,
        photoUrls: (previewRows ?? [])
          .map((row) => row.photo_url)
          .filter((url): url is string => !!url),
        itemCount: count ?? 0,
      };
    }),
  );

  const earnedExpertiseLabels = [
    ...resolveEarnedExpertiseLabels(itemCountByCategory, profile.username),
    ...resolvePlaceExpertiseLabels(regions, profile.username),
  ];

  const { count: followerCount } = await supabase
    .from("user_follows")
    .select("id", { count: "exact", head: true })
    .eq("followed_id", profile.id);

  type FollowingProfile = {
    id: string;
    username: string;
    avatarUrl: string | null;
    expertiseKeys: string[];
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
      // Currently every expertise label sources from "top_list", the same
      // table already queried above for avatar posters -- reuse those rows
      // to count per-friend items instead of an extra query. A future label
      // backed by a different category would add its own count map here.
      const topListCountByUserId = new Map<string, number>();
      for (const item of friendTopListItems ?? []) {
        if (item.image_url && !avatarByUserId.has(item.user_id)) {
          avatarByUserId.set(item.user_id, item.image_url);
        }
        topListCountByUserId.set(
          item.user_id,
          (topListCountByUserId.get(item.user_id) ?? 0) + 1,
        );
      }

      followingProfiles = (friendProfiles ?? []).map((friend) => {
        const itemCounts: Partial<Record<SavedCategory, number>> = {
          top_list: topListCountByUserId.get(friend.id) ?? 0,
        };
        return {
          id: friend.id,
          username: friend.username,
          avatarUrl: avatarByUserId.get(friend.id) ?? null,
          expertiseKeys: resolveEarnedExpertiseLabels(
            itemCounts,
            friend.username,
          ).map((entry) => entry.key),
        };
      });
    }
  }

  const avatarUrl = topListPreview?.posterUrls[0] ?? null;
  const profileUrl = await getProfileUrl(profile.username);

  return (
    <main className="min-h-screen flex flex-col items-center">
      <TrackLastVisitedProfile username={profile.username} />
      <div className="flex-1 w-full flex flex-col items-center gap-4 max-w-2xl p-5 pt-6">
        <Link
          href="/vorschlag"
          aria-label="Zur Inspiration"
          className="rounded-full p-[3px] bg-[conic-gradient(from_0deg,#f97316,#ec4899,#8b5cf6,#3b82f6,#10b981,#f97316)]"
        >
          <span className="block rounded-full bg-background p-[3px]">
            <ProfileAvatar username={profile.username} imageUrl={avatarUrl} />
          </span>
        </Link>

        <div className="flex items-center justify-center gap-1.5">
          {isOwner && (
            <Link
              href="/settings"
              aria-label="Einstellungen"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings className="size-5" />
            </Link>
          )}
          <h1 className="text-xl font-semibold text-center truncate">
            {profile.username}
          </h1>
          {isOwner && (
            <ShareListButton
              shareTitle={`Schau dir ${profile.username}s Filmgeschmack an`}
              url={profileUrl}
              iconOnly
            />
          )}
        </div>

        <ExpertiseBadges labels={earnedExpertiseLabels} />

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Heart className="size-4 fill-current text-red-500" />
            <span>{likesCount} Likes</span>
          </div>
          <FollowerCount targetUserId={profile.id} count={followerCount ?? 0} />
        </div>

        {!isOwner && !isGuest && (
          <FollowButton
            targetUserId={profile.id}
            targetUsername={profile.username}
          />
        )}
        {isGuest && <GuestProfileCta variant="button" />}

        {isOwner && (
          <FollowingBar
            currentUserId={profile.id}
            followingProfiles={followingProfiles}
          />
        )}

        <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
          {previewByCategory.map(({ category, posterUrls, itemCount }) => (
            <ListTile
              key={category}
              label={CATEGORY_LABELS[category]}
              icon={CATEGORY_ICONS[category]}
              posterUrls={posterUrls}
              itemCount={itemCount}
              href={`/u/${profile.username}/${category}`}
              shareUrl={`/u/${profile.username}/${category}`}
            />
          ))}
          {isGuest && <GuestProfileCta variant="tile" />}
        </div>

        {(regions.length > 0 || isOwner) && (
          <div className="w-full flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">Orte</h2>
            <div className="w-full grid grid-cols-2 sm:grid-cols-3 gap-3">
              {regions.map((region) => (
                <ListTile
                  key={region.key}
                  label={region.name}
                  icon={MapPin}
                  posterUrls={region.photoUrls}
                  itemCount={region.itemCount}
                  href={`/u/${profile.username}/orte/${region.key}`}
                  shareUrl={`/u/${profile.username}/orte/${region.key}`}
                />
              ))}
              {isOwner && (
                <Link
                  href="/orte"
                  className="flex flex-col items-center justify-center gap-2 aspect-[2/3] w-full rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="size-8" />
                  <span className="text-xs font-medium text-center">
                    Ort hinzufügen
                  </span>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
