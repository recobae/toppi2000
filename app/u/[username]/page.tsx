import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileStats } from "@/components/profile/profile-stats";
import { ListOverviewSection } from "@/components/profile/list-overview-section";
import { ThanksStat } from "@/components/profile/progress-badges";
import { getTopfContributorIds } from "@/lib/for-me";
import { getInspiredCount, getInspiredCountBatch } from "@/lib/interaction-credits";
import { FollowingBar } from "@/components/profile/following-bar";
import { getListOverviewData } from "@/lib/list-overview";
import { resolveExpertiseTier, CONTENT_TIER_THRESHOLDS, type ExpertiseTier } from "@/lib/expertise-tiers";
import { hasActiveStory as checkHasActiveStory, storyWindowSince } from "@/lib/story-activity";
import { hasUnseenSong } from "@/lib/song-activity";
import { getOwnInteractionRows } from "@/lib/taste-match";

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

  // Rendered for both views (own lists live in the Profil again, not
  // My Taste, which is now pure Quick-Swipe) -- one query set for both
  // covers movieListItemCount/totalPlacesCount for totalActivityCount below
  // too, cheaper than branching on isOwner.
  const listOverview = await getListOverviewData(supabase, {
    userId: profile.id,
    username: profile.username,
    homeCity: profile.home_city,
    showTierProgress: isOwner,
    viewerId: viewer?.id ?? null,
  });

  // Progress badges (Block 3): total like+dislike item_interactions rows,
  // never watchlist/Merken adds or skips -- those aren't a taste opinion.
  const [
    hasActiveStory,
    ownInteractionRows,
    { data: existingFollowRow },
    { count: thanksGivenCount },
    { count: dontWatchCount },
    { count: topfEntryCount },
    viewerInspiredCount,
  ] = await Promise.all([
    checkHasActiveStory(supabase, profile.id),
    getOwnInteractionRows(supabase, profile.id),
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
    // "X-mal von Dir inspiriert" (foreign profile only) -- same übernommen-
    // Ledger as everywhere else, single-pair lookup (viewer -> this profile).
    !isOwner && viewer ? getInspiredCount(supabase, viewer.id, profile.id) : Promise.resolve(0),
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
  const totalActivityCount =
    ownInteractionRows.length +
    listOverview.movieListItemCount +
    (dontWatchCount ?? 0) +
    listOverview.totalPlacesCount +
    (topfEntryCount ?? 0);

  // Only ever needed for the owner's own FollowingBar tile -- a foreign
  // profile visit gets its own separate call further below (Fremdansicht
  // braucht das Follower-Set des BESUCHTEN Profils, nicht des Betrachters).
  // getTopfContributorIds alone (not the heavier getForMeStatus, whose
  // ownCount/friendCount stats moved to Für Dich -- Struktur-Runde) is all
  // this page still needs.
  const ownContributorIds = isOwner ? await getTopfContributorIds(supabase, profile.id) : [];

  type FollowingProfile = {
    id: string;
    username: string;
    avatarUrl: string | null;
    tier: ExpertiseTier;
    hasUnseenStory: boolean;
    inspiredCount: number;
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

      // Block 2.1: the per-avatar inspiration-count badge -- a single
      // batched interaction_credits query for every followed friend at once
      // (Folgeänderungen round, replaced the Taste-Match percentage badge).
      const inspiredCountByUserId = await getInspiredCountBatch(supabase, profile.id, followedIds);

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
          inspiredCount: inspiredCountByUserId.get(friend.id) ?? 0,
        };
      });
    }
  }

  // Foreign view has no `forMe` (own-only), so its FollowingBar's contributor
  // badges need this computed directly -- lean helper, skips the unlock-
  // threshold/preview-image work getForMeStatus also does.
  const foreignContributorIds = !isOwner ? await getTopfContributorIds(supabase, profile.id) : [];

  const avatarUrl = listOverview.rows.find((row) => row.key === "movies")?.preview.urls[0] ?? null;
  const profileUrl = await getProfileUrl(profile.username);

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center gap-4 max-w-2xl p-5 pt-6">
        {/*
          Ein Header für eigenes UND fremdes Profil (Profil-Umbau, Punkt 3):
          Avatar -- Username -- kompakte Icon-Buttons in einer Zeile, direkt
          gefolgt von Freundes-Leiste, dann Statistiken (nur Fremdansicht),
          dann Listen -- exakt die geforderte Reihenfolge, für beide
          Ansichten identisch strukturiert statt zwei getrennter Layouts.
        */}
        <ProfileHeader
          isOwnProfile={isOwner}
          username={profile.username}
          avatarUrl={avatarUrl}
          profileUrl={profileUrl}
          isGuest={isGuest}
          targetUserId={profile.id}
          initialIsFollowing={!!existingFollowRow}
          favoriteSong={favoriteSong}
          hasUnseenSong={unseenSong}
          hasActiveStory={hasActiveStory}
        />

        <FollowingBar
          currentUserId={profile.id}
          followingProfiles={followingProfiles}
          contributorIds={isOwner ? ownContributorIds : foreignContributorIds}
          showAddButton={isOwner}
        />

        {!isOwner && viewer && (
          <ProfileStats
            totalActivityCount={totalActivityCount}
            inspiredCount={viewerInspiredCount}
            viewerId={viewer.id}
            ownerId={profile.id}
            ownerUsername={profile.username}
          />
        )}
        {!isOwner && !viewer && (
          <p className="text-sm font-medium text-center text-blue-600">
            Schon {totalActivityCount} {totalActivityCount === 1 ? "Bewertung" : "Bewertungen"} abgegeben
          </p>
        )}

        {isOwner && <ThanksStat count={thanksGivenCount ?? 0} />}

        {/*
          Eigene gesammelte Listen leben wieder im Profil (Master-Audit
          round) -- My Taste ist reiner Quick-Swipe, keine Listenverwaltung
          mehr. Gleiche Komponente wie in der Fremdansicht, nur mit
          isOwner=true fürs "Neue Liste erstellen"-Picker.
        */}
        <h2 className="w-full text-sm font-medium text-muted-foreground">Das lohnt sich:</h2>
        <ListOverviewSection rows={listOverview.rows} isGuest={isGuest} isOwner={isOwner} />
      </div>
    </main>
  );
}
