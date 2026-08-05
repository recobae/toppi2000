import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RegionPageShell } from "@/components/orte/region-page-shell";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { getOwnInteractionRows } from "@/lib/taste-match";
import type { OwnInteractionEntry } from "@/lib/hooks/use-own-interactions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; regionKey: string }>;
}): Promise<Metadata> {
  const { username, regionKey } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single();

  if (!profile) return { title: "Nicht gefunden" };

  const { data: region } = await supabase
    .from("place_regions")
    .select("region_name")
    .eq("user_id", profile.id)
    .eq("region_key", regionKey)
    .single();

  return { title: region ? `${region.region_name} von ${username}` : "Nicht gefunden" };
}

export default async function RegionListPage({
  params,
}: {
  params: Promise<{ username: string; regionKey: string }>;
}) {
  const { username, regionKey } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: { user: viewer } }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .single(),
    supabase.auth.getUser(),
  ]);

  if (!profile) {
    notFound();
  }

  const { data: region } = await supabase
    .from("place_regions")
    .select("id, region_name")
    .eq("user_id", profile.id)
    .eq("region_key", regionKey)
    .single();

  if (!region) {
    notFound();
  }

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
      <div className="flex-1 w-full flex flex-col gap-4 max-w-5xl p-5">
        <RegionPageShell
          profileUsername={profile.username}
          regionName={region.region_name}
          regionKey={regionKey}
          ownerId={profile.id}
          currentUserId={viewer?.id ?? null}
          initialOwnInteractions={initialOwnInteractions}
        />
      </div>
      <ScrollToTopButton />
    </main>
  );
}
