import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { Heart, ListChecks, MapPin, Plus, Repeat2, Settings, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProfileStoryAvatar } from "@/components/profile/profile-story-avatar";
import { ListOverviewRow } from "@/components/profile/list-overview-row";
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
  VISIBLE_SAVED_CATEGORIES,
  type SavedCategory,
} from "@/lib/categories";
import { resolveEarnedExpertiseLabels, resolvePlaceExpertiseLabels } from "@/lib/expertise";
import { hasActiveStory as checkHasActiveStory, storyWindowSince } from "@/lib/story-activity";
import { computeTasteMatch, TASTE_MATCH_MIN_SHARED } from "@/lib/taste-match";

// "X Likes"/"X mal inspiriert" are replaced by Taste Match below -- kept
// computed (not deleted) in case they come back, just not rendered.
const SHOW_LEGACY_LIKE_STATS = false;

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
    .select("id, username, total_likes_received, home_city")
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
    VISIBLE_SAVED_CATEGORIES.map(async (category) => {
      // Empfohlen (top_list) preview posters follow the same favorite-first,
      // then-newest order as the full list -- manual position no longer
      // drives display anywhere.
      let previewQuery = supabase.from(category).select("image_url").eq("user_id", profile.id);
      previewQuery =
        category === "top_list"
          ? previewQuery
              .order("is_favorite", { ascending: false })
              .order("favorited_at", { ascending: false, nullsFirst: false })
              .order("created_at", { ascending: false })
          : previewQuery.order("position", { ascending: true });

      const [{ data: previewRows }, { count }, { count: noteCount }] = await Promise.all([
        previewQuery.limit(4),
        supabase
          .from(category)
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id),
        supabase
          .from(category)
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .not("note", "is", null),
      ]);

      return {
        category,
        posterUrls: (previewRows ?? [])
          .map((row) => row.image_url)
          .filter((url): url is string => !!url),
        itemCount: count ?? 0,
        noteCount: noteCount ?? 0,
      };
    }),
  );

  const topListPreview = previewByCategory.find((p) => p.category === "top_list");

  const itemCountByCategory = Object.fromEntries(
    previewByCategory.map((entry) => [entry.category, entry.itemCount]),
  ) as Partial<Record<SavedCategory, number>>;

  const { data: regionRows } = await supabase
    .from("place_regions")
    .select("id, region_name, region_key")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: true });

  const allRegions = await Promise.all(
    (regionRows ?? []).map(async (region) => {
      const [{ data: previewRows }, { count }, { count: noteCount }, { count: savedCount }] =
        await Promise.all([
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
          supabase
            .from("places")
            .select("id", { count: "exact", head: true })
            .eq("region_id", region.id)
            .not("note", "is", null),
          supabase
            .from("places")
            .select("id", { count: "exact", head: true })
            .eq("region_id", region.id)
            .eq("status", "want_to_visit"),
        ]);

      return {
        key: region.region_key,
        name: region.region_name,
        photoUrls: (previewRows ?? [])
          .map((row) => row.photo_url)
          .filter((url): url is string => !!url),
        itemCount: count ?? 0,
        noteCount: noteCount ?? 0,
        savedCount: savedCount ?? 0,
      };
    }),
  );

  // A region list auto-empties out of the overview once its last place is
  // removed, instead of lingering as a dead 0-item row.
  const regions = allRegions.filter((region) => region.itemCount > 0);

  const earnedExpertiseLabels = [
    ...resolveEarnedExpertiseLabels(itemCountByCategory, profile.username),
    ...resolvePlaceExpertiseLabels(regions, profile.username),
  ];

  // Two distinct stats, both sourced from interaction_credits -- a ledger of
  // (actor, owner, item, credit_type) rows written at the moment someone
  // likes or adds an item that's on one or more followed people's lists,
  // crediting EVERY one of those owners, not just the first. This replaced
  // the old single-column item_interactions.target_user_id / adopted_from
  // approach, which could only ever credit one owner per event.
  const [{ count: likesCount }, { count: inspiredCount }] = await Promise.all([
    supabase
      .from("interaction_credits")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", profile.id)
      .eq("credit_type", "like"),
    supabase
      .from("interaction_credits")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", profile.id)
      .eq("credit_type", "inspired"),
  ]);

  const hasActiveStory = await checkHasActiveStory(supabase, profile.id);

  const tasteMatch =
    !isOwner && viewer ? await computeTasteMatch(supabase, profile.id, viewer.id) : null;

  const { count: followerCount } = await supabase
    .from("user_follows")
    .select("id", { count: "exact", head: true })
    .eq("followed_id", profile.id);

  type FollowingProfile = {
    id: string;
    username: string;
    avatarUrl: string | null;
    expertiseKeys: string[];
    hasUnseenStory: boolean;
  };

  let followingProfiles: FollowingProfile[] = [];
  if (isOwner) {
    const { data: followRows } = await supabase
      .from("user_follows")
      .select("followed_id")
      .eq("follower_id", profile.id);
    const followedIds = (followRows ?? []).map((row) => row.followed_id);

    if (followedIds.length > 0) {
      const since = storyWindowSince();

      const [
        { data: friendProfiles },
        { data: friendTopListItems },
        { data: recentTopList },
        { data: recentWatchlist },
        { data: recentPlaces },
        { data: recentStoryEvents },
        { data: viewRows },
      ] = await Promise.all([
        supabase.from("profiles").select("id, username").in("id", followedIds),
        supabase
          .from("top_list")
          .select("user_id, image_url")
          .in("user_id", followedIds)
          .order("position", { ascending: true }),
        supabase
          .from("top_list")
          .select("user_id, created_at")
          .in("user_id", followedIds)
          .gte("created_at", since),
        supabase
          .from("watchlist")
          .select("user_id, created_at")
          .in("user_id", followedIds)
          .gte("created_at", since),
        supabase
          .from("places")
          .select("user_id, created_at")
          .in("user_id", followedIds)
          .gte("created_at", since),
        supabase
          .from("story_events")
          .select("user_id, created_at")
          .in("user_id", followedIds)
          .gte("created_at", since),
        supabase
          .from("story_views")
          .select("target_user_id, viewed_at")
          .eq("viewer_id", profile.id)
          .in("target_user_id", followedIds),
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

      const latestActivityByUserId = new Map<string, string>();
      for (const rows of [recentTopList, recentWatchlist, recentPlaces, recentStoryEvents]) {
        for (const row of rows ?? []) {
          const existing = latestActivityByUserId.get(row.user_id);
          if (!existing || row.created_at > existing) {
            latestActivityByUserId.set(row.user_id, row.created_at);
          }
        }
      }
      const viewedAtByUserId = new Map(
        (viewRows ?? []).map((row) => [row.target_user_id, row.viewed_at]),
      );

      followingProfiles = (friendProfiles ?? []).map((friend) => {
        const itemCounts: Partial<Record<SavedCategory, number>> = {
          top_list: topListCountByUserId.get(friend.id) ?? 0,
        };
        const latestActivity = latestActivityByUserId.get(friend.id) ?? null;
        const viewedAt = viewedAtByUserId.get(friend.id) ?? null;

        return {
          id: friend.id,
          username: friend.username,
          avatarUrl: avatarByUserId.get(friend.id) ?? null,
          expertiseKeys: resolveEarnedExpertiseLabels(
            itemCounts,
            friend.username,
          ).map((entry) => entry.key),
          hasUnseenStory: !!latestActivity && (!viewedAt || viewedAt < latestActivity),
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
        <ProfileStoryAvatar
          username={profile.username}
          avatarUrl={avatarUrl}
          hasActiveStory={hasActiveStory}
          isOwnStory={isOwner}
          canInteract={!isGuest}
        />

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

        <ExpertiseBadges labels={earnedExpertiseLabels} homeCity={profile.home_city} />

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {SHOW_LEGACY_LIKE_STATS && (
            <>
              <div className="flex items-center gap-1.5">
                <Heart className="size-4 fill-current text-red-500" />
                <span>{likesCount ?? 0} Likes</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Repeat2 className="size-4 text-primary" />
                <span>{inspiredCount ?? 0} mal inspiriert</span>
              </div>
            </>
          )}
          {tasteMatch && (
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" />
              <span>
                {tasteMatch.percentage !== null
                  ? `${tasteMatch.percentage}% Taste Match aus ${tasteMatch.sharedCount} Bewertungen`
                  : `Noch nicht genug Daten (${tasteMatch.sharedCount}/${TASTE_MATCH_MIN_SHARED} gemeinsame Bewertungen)`}
              </span>
            </div>
          )}
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
          <Link
            href="/meine-aktivitaet"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ListChecks className="size-3.5" />
            Meine Aktivität
          </Link>
        )}

        {isOwner && (
          <FollowingBar
            currentUserId={profile.id}
            followingProfiles={followingProfiles}
          />
        )}

        <div className="w-full flex flex-col gap-2 mt-2">
          {previewByCategory.map(({ category, posterUrls, itemCount, noteCount }) => (
            <ListOverviewRow
              key={category}
              title={CATEGORY_LABELS[category]}
              icon={CATEGORY_ICONS[category]}
              preview={{ type: "stack", urls: posterUrls }}
              itemCount={itemCount}
              noteCount={noteCount}
              href={`/u/${profile.username}/${category}`}
              shareUrl={`/u/${profile.username}/${category}`}
            />
          ))}
          {isGuest && <GuestProfileCta variant="row" />}
        </div>

        {(regions.length > 0 || isOwner) && (
          <div className="w-full flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">Orte</h2>
            <div className="w-full flex flex-col gap-2">
              {regions.map((region) => (
                <ListOverviewRow
                  key={region.key}
                  title={region.name}
                  icon={MapPin}
                  preview={{ type: "collage", urls: region.photoUrls }}
                  itemCount={region.itemCount}
                  noteCount={region.noteCount}
                  savedCount={region.savedCount}
                  href={`/u/${profile.username}/orte/${region.key}`}
                  shareUrl={`/u/${profile.username}/orte/${region.key}`}
                />
              ))}
              {isOwner && (
                <Link
                  href="/inspiration?tab=orte"
                  className="flex items-center justify-center gap-2 h-14 w-full rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="size-5" />
                  <span className="text-sm font-medium">
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
