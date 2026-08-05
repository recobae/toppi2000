import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { ListChecks, MapPin, Settings, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ForeignProfileHero } from "@/components/profile/foreign-profile-hero";
import { ForMeHero } from "@/components/profile/for-me-hero";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { ListOverviewRow } from "@/components/profile/list-overview-row";
import { GuestProfileCta } from "@/components/profile/guest-profile-cta";
import { TrackLastVisitedProfile } from "@/components/profile/track-last-visited";
import { FollowButton } from "@/components/profile/follow-button";
import { NewListPicker } from "@/components/profile/new-list-picker";
import { ShareListButton } from "@/components/lists/share-list-button";
import { TasteMatchExpandable } from "@/components/profile/taste-match-expandable";
import { ThanksStat } from "@/components/profile/progress-badges";
import { getForMeStatus, getTopfContributorIds, type ForMeStatus } from "@/lib/for-me";
import { FollowingBar } from "@/components/profile/following-bar";
import { MOVIE_LIST_LABEL, VISIBLE_SAVED_CATEGORIES, movieListHref } from "@/lib/categories";
import {
  resolveExpertiseTier,
  tierProgressLabel,
  CONTENT_TIER_THRESHOLDS,
  PLACE_TIER_THRESHOLDS,
  type ExpertiseTier,
} from "@/lib/expertise-tiers";
import { hasActiveStory as checkHasActiveStory, storyWindowSince } from "@/lib/story-activity";
import { hasUnseenSong } from "@/lib/song-activity";
import {
  computeTasteMatch,
  computeTasteMatchBatch,
  bestTasteMatchPercentage,
  getOwnInteractionRows,
} from "@/lib/taste-match";

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

  // Stats-parity with the Orte tiles (Punkt 8): Empfohlen split by
  // media_type (movie vs. tv), Watchlist shown as "gemerkt" -- the same
  // empfohlen/gemerkt semantic Orte already uses via places.status.
  const [{ count: moviesRecommendedCount }, { count: seriesRecommendedCount }] = await Promise.all([
    supabase
      .from("top_list")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("media_type", "movie"),
    supabase
      .from("top_list")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("media_type", "tv"),
  ]);
  const movieListStatsText = [
    `${moviesRecommendedCount ?? 0} Filme empfohlen`,
    `${seriesRecommendedCount ?? 0} Serien empfohlen`,
    ...(movieListNoteCount > 0 ? [`${movieListNoteCount} mit Notiz`] : []),
    ...((watchlistPreview?.itemCount ?? 0) > 0 ? [`${watchlistPreview?.itemCount} gemerkt`] : []),
  ].join(" · ");

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
    hasActiveStory,
    { ownInteractionRows, tasteMatch },
    { count: followerCount },
    { data: existingFollowRow },
    { count: thanksGivenCount },
    { count: dontWatchCount },
    { count: topfEntryCount },
  ] = await Promise.all([
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
    // The two active-capture sources not already fetched elsewhere on this
    // page for totalActivityCount below -- top_list/watchlist counts come
    // from previewByCategory above, item_interactions from
    // ownInteractionRows, places from allRegions.
    supabase
      .from("dont_watch")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id),
    supabase
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("status", "active"),
  ]);

  // Einheitlicher Aktivitäts-Counter (nur noch "Bewertungen", keine separate
  // Empfehlungen-Zahl im Profil): Summe aller aktiven Erfassungsarten --
  // geswiped/importiert/über Inspiration bzw. Suche hinzugefügt landen alle
  // in top_list/watchlist/dont_watch, unabhängig bewertete Items in
  // item_interactions, Orte in places, Mein-Topf-Einträge in recommendations.
  // Bewusst eine addierte Summe über die Erfassungs-Quellen, kein
  // distinktes Set über Item-Identitäten hinweg (die Tabellen nutzen
  // unterschiedliche Identitätsschemata: TMDB-item_id+media_type für Filme,
  // place_id für Orte, category_key+external_id für Mein-Topf) -- "Summe"
  // war explizit die Anforderung, kein Dedupe.
  const totalPlacesCount = allRegions.reduce((sum, region) => sum + region.itemCount, 0);
  const totalActivityCount =
    ownInteractionRows.length +
    (topListPreview?.itemCount ?? 0) +
    (watchlistPreview?.itemCount ?? 0) +
    (dontWatchCount ?? 0) +
    totalPlacesCount +
    (topfEntryCount ?? 0);

  // Only ever needed for the owner's own FollowingBar tile -- a foreign
  // profile visit never renders it, so skip the extra queries entirely.
  const forMe: ForMeStatus | null = isOwner
    ? await getForMeStatus(supabase, profile.id, totalActivityCount)
    : null;

  type FollowingProfile = {
    id: string;
    username: string;
    avatarUrl: string | null;
    tier: ExpertiseTier;
    hasUnseenStory: boolean;
    tasteMatchBadge: number | null;
  };

  let followingProfiles: FollowingProfile[] = [];
  // Now used by both views (Bug/Ausbau-Runde, Punkt 7) -- the query was
  // already generic over profile.id, only the surrounding `if` was
  // needlessly own-view-only.
  {
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
        const latestActivity = latestActivityByUserId.get(friend.id) ?? null;
        const viewedAt = viewedAtByUserId.get(friend.id) ?? null;

        return {
          id: friend.id,
          username: friend.username,
          avatarUrl: avatarByUserId.get(friend.id) ?? null,
          // Consolidated onto the one tiered Kenner/Experte system (Metriken-
          // Audit, Punkt E) -- the old separate minItems:1 "expertise label"
          // badge fired for nearly every friend with a single list item and
          // conveyed no real signal. Same threshold/table the profile page's
          // own list rows already use.
          tier: resolveExpertiseTier(topListCountByUserId.get(friend.id) ?? 0, CONTENT_TIER_THRESHOLDS),
          hasUnseenStory: !!latestActivity && (!viewedAt || viewedAt < latestActivity),
          tasteMatchBadge: tasteMatchByUserId.get(friend.id) ?? null,
        };
      });
    }
  }

  // Foreign view has no `forMe` (own-only), so its FollowingBar's contributor
  // badges need this computed directly -- lean helper, skips the unlock-
  // threshold/preview-image work getForMeStatus also does.
  const foreignContributorIds = !isOwner ? await getTopfContributorIds(supabase, profile.id) : [];

  const avatarUrl = topListPreview?.posterUrls[0] ?? null;
  const profileUrl = await getProfileUrl(profile.username);

  return (
    <main className="min-h-screen flex flex-col items-center">
      <TrackLastVisitedProfile username={profile.username} />
      <div className="flex-1 w-full flex flex-col items-center gap-4 max-w-2xl p-5 pt-6">
        {/*
          Scrollt normal mit dem restlichen Content -- nicht mehr sticky/
          fixed. Nur Avatar links, Settings + Teilen rechts. My Taste ist im
          Funnel (ForMeHero), kein Username-Text hier.
        */}
        {isOwner && (
          <div className="w-full flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 shrink-0">
              <ProfileAvatar username={profile.username} imageUrl={avatarUrl} size="sm" />
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <Link
                href="/settings"
                aria-label="Einstellungen"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-background/80 shadow-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Settings className="size-5" />
              </Link>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-background/80 shadow-sm">
                <ShareListButton
                  shareTitle={`Schau dir ${profile.username}s Filmgeschmack an`}
                  url={profileUrl}
                  iconOnly
                />
              </span>
            </span>
          </div>
        )}
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
              username={profile.username}
              forMe={forMe}
              followerCount={followerCount ?? 0}
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

        {/* Fremdansicht: dieses Profils eigene Follower/Beitragende, nicht die des Betrachters (Punkt 7). */}
        {!isOwner && (
          <FollowingBar
            currentUserId={profile.id}
            followerCount={followerCount ?? 0}
            followingProfiles={followingProfiles}
            contributorIds={foreignContributorIds}
            showAddButton={false}
          />
        )}

        {/*
          Eigenansicht: Name/Avatar sitzen jetzt oben sticky (Punkt 3), hier
          also keine eigene Username-Zeile mehr. Fremdansicht behält den
          Namen an dieser Stelle unverändert.
        */}
        {!isOwner && (
          <div className="flex items-center justify-center gap-1.5">
            <h1 className="text-xl font-semibold text-center truncate">
              {profile.username}
            </h1>
            {/*
              Kompaktes Entfolgen-Icon direkt neben dem Namen (Punkt 5) --
              FollowButton rendert bei isFollowing bereits genau das (ein
              "..."-Icon mit Bestätigungsdialog), hier nur an anderer
              Stelle platziert statt neu gebaut. Serverseitig bekannter
              Ausgangszustand entscheidet die Position, nicht Client-State
              -- nach einem Unfollow lädt router.refresh() die Seite neu
              und der Button wandert dann konsistent zur unteren "Inspirierend"-CTA.
            */}
            {!isGuest && existingFollowRow && (
              <FollowButton
                targetUserId={profile.id}
                targetUsername={profile.username}
                initialIsLoggedIn
                initialIsFollowing
              />
            )}
            {/* Teilen für Besucher (Punkt 8) -- gleiche iconOnly-Variante wie in der Eigenansicht, nur auf das fremde Profil bezogen. */}
            <ShareListButton
              shareTitle={`Schau dir ${profile.username}s Filmgeschmack an`}
              url={profileUrl}
              iconOnly
            />
          </div>
        )}

        {tasteMatch && (
          <TasteMatchExpandable username={profile.username} tasteMatch={tasteMatch} />
        )}

        <ThanksStat count={thanksGivenCount ?? 0} />

        {/*
          Nur noch eine Gesamtzahl im Profil, gleicher Stil für Eigen- und
          Fremdansicht -- die frühere zweite "davon N für dich"-Zeile
          (Mein-Topf-Attribution) ist entfernt, Empfehlungen bleiben
          ausschließlich über For Me sichtbar (Ring/Unlock), nicht als
          eigene Zahl hier im Profil.
        */}
        {!isOwner && (
          <p className="text-sm font-medium text-center">
            {totalActivityCount} {totalActivityCount === 1 ? "Bewertung" : "Bewertungen"} von{" "}
            {profile.username}
          </p>
        )}

        {!isOwner && !isGuest && !existingFollowRow && (
          <FollowButton
            targetUserId={profile.id}
            targetUsername={profile.username}
            initialIsLoggedIn
            initialIsFollowing={false}
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
              statsText: movieListStatsText,
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
              statsText: undefined as string | undefined,
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
                statsText={row.statsText}
              />
            ))}
          {isGuest && <GuestProfileCta variant="row" />}
          {isOwner && <NewListPicker />}
        </div>
      </div>
    </main>
  );
}
