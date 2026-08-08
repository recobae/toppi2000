import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Wo warst du schon mal?" (Lohnt-sich-Umbau §4) -- getrennt von der
 * Orts-Bewertung einzelner Plätze (item_interactions): dieses Signal sagt
 * nur, ob der Nutzer eine ganze Stadt/Region überhaupt kennt, nicht ob ein
 * bestimmter Ort dort sich lohnt. "War ich schon dort?" und "Lohnt sich
 * dieser Ort?" bleiben zwei getrennte gespeicherte Signale, wie gefordert.
 */
export type RegionFamiliarityStatus = "visited" | "unknown" | "want_to_explore";

export async function setRegionFamiliarity(
  supabase: SupabaseClient,
  userId: string,
  regionKey: string,
  regionName: string,
  status: RegionFamiliarityStatus,
) {
  return supabase.from("region_familiarity").upsert(
    { user_id: userId, region_key: regionKey, region_name: regionName, status, updated_at: new Date().toISOString() },
    { onConflict: "user_id,region_key" },
  );
}

export async function getRegionFamiliarity(
  supabase: SupabaseClient,
  userId: string,
  regionKey: string,
): Promise<RegionFamiliarityStatus | null> {
  const { data } = await supabase
    .from("region_familiarity")
    .select("status")
    .eq("user_id", userId)
    .eq("region_key", regionKey)
    .maybeSingle();
  return (data?.status as RegionFamiliarityStatus | undefined) ?? null;
}
