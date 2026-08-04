import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { Heart, ListChecks, MapPin, Plus, Repeat2, Settings, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ForeignProfileHero } from "@/components/profile/foreign-profile-hero";
import { ForMeHero } from "@/components/profile/for-me-hero";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { ListOverviewRow } from "@/components/profile/list-overview-row";
import { GuestProfileCta } from "@/components/profile/guest-profile-cta";
import { TrackLastVisitedProfile } from "@/components/profile/track-last-visited";
import { FollowButton } from "@/components/profile/follow-button";
import { FollowerCount } from "@/components/profile/follower-count";
import { FollowerQuickbar } from "@/components/profile/follower-quickbar";
import { ShareListButton } from "@/components/lists/share-list-button";
import { TasteMatchExpandable } from "@/components/profile/taste-match-expandable";
import { ProgressBadges } from "@/components/profile/progress-badges";
import { getForMeStatus, type ForMeStatus } from "@/lib/for-me";
import {
  MOVIE_LIST_LABEL,
  VISIBLE_SAVED_CATEGORIES,
  movieListHref,
  type SavedCategory,
} from "@/lib/categories";
import { resolveEarnedExpertiseLabels } from "@/lib/expertise";
import {
  resolveExpertiseTier,
  tierProgressLabel,
  CONTENT_TIER_THRESHOLDS,
  PLACE_TIER_THRESHOLDS,
} from "@/lib/expertise-tiers";
import { hasActiveStory as checkHasActiveStory, storyWindowSince } from "@/lib/story-activity";
import { hasUnseenSong } from "@/lib/song-activity";
import {
  computeTasteMatch,
  computeTasteMatchBatch,
  bestTasteMatchPercentage,
  getOwnInteractionRows,
} from "@/lib/taste-match";

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

  const [{ data: profile }, { data: { user: viewer } }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, username, total_likes_received, home_city, favorite_song_title, favorite_song_artist, favorite_song_preview_url, favorite_song_artwork_url, favorite_song_updated_at",
      )
      .eq("username", username)
      .single(),
    supabase.auth.getUser(),
  ]);

  if (!profile) {
    notFound();
  }

  const isOwner = viewer?.id === profile.id;
  const isGuest = !viewer;
  const favoriteSong =
    profile.favorite_song_title && profile.favorite_song_preview_url
      ? {
          title: profile.favorite_song_title,
          artist: profile.favorite_song_artist,
          previewUrl: profile.favorite_song_preview_url,
          artworkUrl: profile.favorite_song_artwork_url,
        }
      : null;
  const unseenSong =
    !isOwner && !isGuest && viewer && favoriteSong
      ? await hasUnseenSong(supabase, viewer.id, profile.id, profile.favorite_song_updated_at)
      : false;

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
  const watchlistPreview = previewByCategory.find((p) => p.category === "watchlist");
  // Empfohlen and Watchlist show as one merged row on the profile now (see
  // /u/[username]/filme) -- posters favor Empfohlen first, same priority the
  // merged list itself uses when an item could theoretically sit in both.
  const movieListItemCount = (topListPreview?.itemCount ?? 0) + (watchlistPreview?.itemCount ?? 0);
  const movieListNoteCount = (topListPreview?.noteCount ?? 0) + (watchlistPreview?.noteCount ?? 0);
  const movieListPosterUrls = [
    ...(topListPreview?.posterUrls ?? []),
    ...(watchlistPreview?.posterUrls ?? []),
  ].slice(0, 4);

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

  // Two distinct stats, both sourced from interaction_credits -- a ledger of
  // (actor, owner, item, credit_type) rows written at the moment someone
  // likes or adds an item that's on one or more followed people's lists,
  // crediting EVERY one of those owners, not just the first. This replaced
  // the old single-column item_interactions.target_user_id / adopted_from
  // approach, which could only ever credit one owner per event.
  // Progress badges (Block 3): total like+dislike item_interactions rows,
  // never watchlist/Merken adds or skips -- those aren't a taste opinion.
  // Fetched once as raw rows (ownInteractionRows) and reused for both the
  // counts below and, when applicable, as computeTasteMatch's owner-side
  // input -- avoids a second identical item_interactions query for
  // profile.id that a separate count-only query and computeTasteMatch's own
  // internal fetch would otherwise both run.
  const [
    [{ count: likesCount }, { count: inspiredCount }],
    hasActiveStory,
    { ownInteractionRows, tasteMatch },
    { count: followerCount },
    { data: existingFollowRow },
    { count: thanksGivenCount },
  ] = await Promise.all([
    Promise.all([
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
    ]),
    checkHasActiveStory(supabase, profile.id),
    (async () => {
      const ownInteractionRows = await getOwnInteractionRows(supabase, profile.id);
      const tasteMatch =
        !isOwner && viewer
          ? await computeTasteMatch(supabase, profile.id, viewer.id, ownInteractionRows)
          : null;
      return { ownInteractionRows, tasteMatch };
    })(),
    supabase
      .from("user_follows")
      .select("id", { count: "exact", head: true })
      .eq("followed_id", profile.id),
    // Resolved here (instead of inside FollowButton on mount) so the button
    // never needs its own client-side getUser()+user_follows roundtrip --
    // both ids are already known on this page.
    !isOwner && viewer
      ? supabase
          .from("user_follows")
          .select("id")
          .eq("follower_id", viewer.id)
          .eq("followed_id", profile.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // "Mein Topf": how many recommenders this profile has thanked.
    supabase
      .from("recommendation_thanks")
      .select("id", { count: "exact", head: true })
      .eq("thanked_by_user_id", profile.id),
  ]);

  const movieInteractionCount = ownInteractionRows.filter((row) => row.media_type !== "place").length;
  const placeInteractionCount = ownInteractionRows.filter((row) => row.media_type === "place").length;

  // Only ever needed for the owner's own FollowingBar tile -- a foreign
  // profile visit never renders it, so skip the extra queries entirely.
  const forMe: ForMeStatus | null = isOwner
    ? await getForMeStatus(supabase, profile.id, movieInteractionCount + placeInteractionCount)
    : null;

  type FollowingProfile = {
    id: string;
    username: string;
    avatarUrl: string | null;
    expertiseKeys: string[];
    hasUnseenStory: boolean;
    tasteMatchBadge: number | null;
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
        { data: recentWatchlist },
        { data: recentPlaces },
        { data: recentStoryEvents },
        { data: viewRows },
      ] = await Promise.all([
        supabase.from("profiles").select("id, username").in("id", followedIds),
        // Combines what used to be two separate top_list queries over the
        // same followedIds rows (avatar/position + recent-activity
        // timestamps) into one -- both are derived from it below instead.
        supabase
          .from("top_list")
          .select("user_id, image_url, created_at")
          .in("user_id", followedIds)
          .order("position", { ascending: true }),
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
          .eq("content_type", "story")
          .in("target_user_id", followedIds),
      ]);

      const avatarByUserId = new Map<string, string>();
      // Currently every expertise label sources from "top_list", the same
      // table already queried above for avatar posters -- reuse those rows
      // to count per-friend items instead of an extra query. A future label
      // backed by a different category would add its own count map here.
      const topListCountByUserId = new Map<string, number>();
      const recentTopList = (friendTopListItems ?? []).filter((item) => item.created_at >= since);
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

      // Block 2.1: the small Taste-Match badge on each avatar -- a single
      // batched pair of item_interactions queries for every followed friend
      // at once, instead of one computeTasteMatch call (2 queries) per friend.
      const tasteMatchBatch = await computeTasteMatchBatch(supabase, followedIds, profile.id);
      const tasteMatchByUserId = new Map(
        [...tasteMatchBatch].map(([friendId, match]) => [friendId, bestTasteMatchPercentage(match)] as const),
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
          tasteMatchBadge: tasteMatchByUserId.get(friend.id) ?? null,
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
        {/*
          Eigenansicht/Fremdansicht-Weiche: in der Eigenansicht ersetzt "For
          Me" den Avatar komplett (gleiche Position/Dominanz wie zuvor das
          Profilbild) -- die Fremdansicht behält den unveränderten Avatar
          samt Song-Trigger.
        */}
        {isOwner ? (
          forMe && (
            <ForMeHero
              userId={profile.id}
              forMe={forMe}
              followingProfiles={followingProfiles}
              contributorIds={forMe.contributorUserIds}
            />
          )
        ) : (
          <ForeignProfileHero
            username={profile.username}
            avatarUrl={avatarUrl}
            hasActiveStory={hasActiveStory}
            isGuest={isGuest}
            favoriteSong={favoriteSong}
            targetUserId={profile.id}
            hasUnseenSong={unseenSong}
          />
        )}

        {/* Kompakt an den Profilanfang, direkt unter dem Hero (Punkt 4). */}
        {isOwner && <FollowerQuickbar currentUserId={profile.id} count={followerCount ?? 0} />}

        <div className="flex items-center justify-center gap-1.5">
          {isOwner && (
            <>
              {/*
                Kleiner, nicht-dominanter Identitäts-Anker (Schritt 5) --
                rein dekorativ, kein eigener Tap-Handler, da der große
                Avatar-Slot jetzt "For Me" gehört.
              */}
              <span className="shrink-0">
                <ProfileAvatar username={profile.username} imageUrl={avatarUrl} size="sm" />
              </span>
              <Link
                href="/settings"
                aria-label="Einstellungen"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Settings className="size-5" />
              </Link>
            </>
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
          {!isOwner && <FollowerCount targetUserId={profile.id} count={followerCount ?? 0} />}
        </div>

        {tasteMatch && (
          <TasteMatchExpandable username={profile.username} tasteMatch={tasteMatch} />
        )}

        <ProgressBadges
          movieCount={movieInteractionCount ?? 0}
          placeCount={placeInteractionCount ?? 0}
          thanksGivenCount={thanksGivenCount ?? 0}
          showRing={isOwner}
        />

        {!isOwner && !isGuest && (
          <FollowButton
            targetUserId={profile.id}
            targetUsername={profile.username}
            initialIsLoggedIn
            initialIsFollowing={!!existingFollowRow}
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

        {/*
          Kategorien und Orte als eine gemeinsame, nach Größe sortierte Liste
          (Schritt 7) statt fester Film-Zeile + separater "Orte"-Sektion --
          die aktivste Liste steht immer oben, unabhängig vom Typ.
        */}
        <div className="w-full flex flex-col gap-2 mt-2">
          {[
            {
              key: "movies",
              title: MOVIE_LIST_LABEL,
              icon: Star,
              preview: { type: "stack" as const, urls: movieListPosterUrls },
              itemCount: movieListItemCount,
              noteCount: movieListNoteCount,
              savedCount: undefined,
              href: movieListHref(profile.username),
              tier: resolveExpertiseTier(movieListItemCount, CONTENT_TIER_THRESHOLDS),
              tierProgress: isOwner
                ? tierProgressLabel(movieListItemCount, CONTENT_TIER_THRESHOLDS)
                : null,
              isCurrentLocation: false,
            },
            ...regions.map((region) => ({
              key: region.key,
              title: region.name,
              icon: MapPin,
              preview: { type: "collage" as const, urls: region.photoUrls },
              itemCount: region.itemCount,
              noteCount: region.noteCount,
              savedCount: region.savedCount,
              href: `/u/${profile.username}/orte/${region.key}`,
              tier: resolveExpertiseTier(region.itemCount, PLACE_TIER_THRESHOLDS),
              tierProgress: isOwner
                ? tierProgressLabel(region.itemCount, PLACE_TIER_THRESHOLDS)
                : null,
              isCurrentLocation: region.name === profile.home_city,
            })),
          ]
            .sort((a, b) => b.itemCount - a.itemCount)
            .map((row) => (
              <ListOverviewRow
                key={row.key}
                title={row.title}
                icon={row.icon}
                preview={row.preview}
                itemCount={row.itemCount}
                noteCount={row.noteCount}
                savedCount={row.savedCount}
                href={row.href}
                shareUrl={row.href}
                tier={row.tier}
                tierProgressLabel={row.tierProgress}
                isCurrentLocation={row.isCurrentLocation}
              />
            ))}
          {isGuest && <GuestProfileCta variant="row" />}
          {isOwner && (
            <Link
              href="/inspiration?tab=orte"
              className="flex items-center justify-center gap-2 h-14 w-full rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Plus className="size-5" />
              <span className="text-sm font-medium">Ort hinzufügen</span>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
