import type { SupabaseClient } from "@supabase/supabase-js";
import { getRecommendationCategory } from "@/lib/recommendation-categories";

/**
 * "Gerade neu von deinem Netzwerk" (Lohnt-sich-Umbau §4) -- Ereignisse, die
 * lib/discovery.ts's item-basierte Sections (Bewertungen von Freunden) nicht
 * abdecken: eine neu angelegte Orte-Liste, ein neu hinzugefügter Ort, ein
 * neuer Top-Liste-/Watchlist-Eintrag, eine neue Mein-Topf-Empfehlung.
 *
 * EINE gemeinsame, typisierte Struktur für alle vier Kategorien -- gleiche
 * Sortierung (nach createdAt), gleiche Darstellung (NetworkActivityFeed),
 * kein separates UI-Pattern pro Quelle. `describeNetworkActivityEvent()` ist
 * die einzige Stelle, die den Anzeigetext baut, damit Datenquelle und
 * Wortlaut nicht auseinanderlaufen können.
 *
 * "Marcus geht zu Konzert/Festival XYZ" aus der Anfrage ist mit dem
 * bestehenden Datenmodell nicht abbildbar -- es gibt keine Event-/Konzert-
 * Tabelle irgendwo im Schema. Bewusst nicht erfunden/simuliert.
 */
export type NetworkActivityKind = "new_region" | "place_added" | "top_list_added" | "watchlist_added" | "recommendation_added";

export type NetworkActivityEvent = {
  kind: NetworkActivityKind;
  actorUsername: string;
  actorUserId: string;
  /** Der primäre Gegenstand des Ereignisses: Listenname, Ortsname, Filmtitel, Empfehlungstitel. */
  title: string;
  /** Sekundärer Kontext, falls vorhanden: Regionsname (bei place_added) oder Kategorie-Label (bei recommendation_added). */
  context?: string;
  createdAt: string;
};

/**
 * Die eine Stelle, die aus einem Event einen Anzeigetext macht -- bewusst
 * ohne "seiner"/"ihrer" (kein Geschlecht im Datenmodell gespeichert, also
 * nicht geraten), sonst nah am in der Anfrage gewünschten Wortlaut.
 */
export function describeNetworkActivityEvent(event: NetworkActivityEvent): string {
  switch (event.kind) {
    case "new_region":
      return `hat eine neue Liste „${event.title}“ erstellt`;
    case "place_added":
      return `hat „${event.title}“ zu „${event.context}“ hinzugefügt`;
    case "top_list_added":
      return `hat „${event.title}“ zur Top-Liste hinzugefügt`;
    case "watchlist_added":
      return `hat „${event.title}“ zur Watchlist hinzugefügt`;
    case "recommendation_added":
      return event.context
        ? `hat „${event.title}“ (${event.context}) im Topf ergänzt`
        : `hat „${event.title}“ im Topf ergänzt`;
  }
}

type RegionRow = { id: string; user_id: string; region_name: string; region_key: string; created_at: string };
type PlaceRow = { user_id: string; name: string; created_at: string; region_id: string };
type MovieListRow = { user_id: string; title: string; created_at: string };
type RecommendationRow = { user_id: string; title: string; category_key: string; created_at: string };

export async function getNetworkActivityFeed(
  supabase: SupabaseClient,
  userId: string,
  limit = 8,
): Promise<NetworkActivityEvent[]> {
  const { data: followRows } = await supabase.from("user_follows").select("followed_id").eq("follower_id", userId);
  const followedIds = (followRows ?? []).map((row) => row.followed_id as string);
  if (followedIds.length === 0) return [];

  const [{ data: regionRows }, { data: placeRows }, { data: topListRows }, { data: watchlistRows }, { data: recRows }] =
    await Promise.all([
      supabase
        .from("place_regions")
        .select("id, user_id, region_name, region_key, created_at")
        .in("user_id", followedIds)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("places")
        .select("user_id, name, created_at, region_id")
        .in("user_id", followedIds)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("top_list")
        .select("user_id, title, created_at")
        .in("user_id", followedIds)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("watchlist")
        .select("user_id, title, created_at")
        .in("user_id", followedIds)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("recommendations")
        .select("user_id, title, category_key, created_at")
        .in("user_id", followedIds)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

  const actorIds = [
    ...new Set(
      [...(regionRows ?? []), ...(placeRows ?? []), ...(topListRows ?? []), ...(watchlistRows ?? []), ...(recRows ?? [])].map(
        (row) => row.user_id as string,
      ),
    ),
  ];
  const regionIds = [...new Set((placeRows ?? []).map((row) => (row as PlaceRow).region_id))];

  const [{ data: profileRows }, { data: placeRegionLookup }] = await Promise.all([
    actorIds.length > 0
      ? supabase.from("profiles").select("id, username").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; username: string }[] }),
    regionIds.length > 0
      ? supabase.from("place_regions").select("id, region_name, region_key").in("id", regionIds)
      : Promise.resolve({ data: [] as { id: string; region_name: string; region_key: string }[] }),
  ]);

  const usernameById = new Map((profileRows ?? []).map((row) => [row.id, row.username]));
  const regionById = new Map((placeRegionLookup ?? []).map((row) => [row.id, row]));

  const events: NetworkActivityEvent[] = [];

  for (const row of (regionRows ?? []) as RegionRow[]) {
    events.push({
      kind: "new_region",
      actorUsername: usernameById.get(row.user_id) ?? "Jemand",
      actorUserId: row.user_id,
      title: row.region_name,
      createdAt: row.created_at,
    });
  }

  for (const row of (placeRows ?? []) as PlaceRow[]) {
    const region = regionById.get(row.region_id);
    if (!region) continue;
    events.push({
      kind: "place_added",
      actorUsername: usernameById.get(row.user_id) ?? "Jemand",
      actorUserId: row.user_id,
      title: row.name,
      context: region.region_name,
      createdAt: row.created_at,
    });
  }

  for (const row of (topListRows ?? []) as MovieListRow[]) {
    events.push({
      kind: "top_list_added",
      actorUsername: usernameById.get(row.user_id) ?? "Jemand",
      actorUserId: row.user_id,
      title: row.title,
      createdAt: row.created_at,
    });
  }

  for (const row of (watchlistRows ?? []) as MovieListRow[]) {
    events.push({
      kind: "watchlist_added",
      actorUsername: usernameById.get(row.user_id) ?? "Jemand",
      actorUserId: row.user_id,
      title: row.title,
      createdAt: row.created_at,
    });
  }

  for (const row of (recRows ?? []) as RecommendationRow[]) {
    events.push({
      kind: "recommendation_added",
      actorUsername: usernameById.get(row.user_id) ?? "Jemand",
      actorUserId: row.user_id,
      title: row.title,
      context: getRecommendationCategory(row.category_key)?.label,
      createdAt: row.created_at,
    });
  }

  return events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
}
