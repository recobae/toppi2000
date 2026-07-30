import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { RegionItemsGrid } from "@/components/orte/region-items-grid";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("username", username)
    .single();

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

  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-6 max-w-5xl p-5">
        <div className="flex flex-col gap-1 pt-8">
          <Link
            href={`/u/${profile.username}`}
            className="text-sm text-muted-foreground hover:underline w-fit"
          >
            ← Zum Profil
          </Link>
          <h1 className="font-medium text-xl">{region.region_name}</h1>
        </div>
        <RegionItemsGrid
          username={profile.username}
          regionKey={regionKey}
          regionName={region.region_name}
          ownerId={profile.id}
          currentUserId={viewer?.id ?? null}
        />
      </div>
    </main>
  );
}
