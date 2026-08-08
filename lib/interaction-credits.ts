import type { SupabaseClient } from "@supabase/supabase-js";
import { removeInteraction, type InteractionMediaType } from "@/lib/interactions";
import { CATEGORY_LABELS, movieListHref } from "@/lib/categories";

// Provenance ledger for the profile stats "X Likes" / "X mal inspiriert".
// Separate from item_interactions (which only ever holds ONE row per
// (user, item) -- the actor's own current stance) because a single like or
// add-to-list action must be able to credit MULTIPLE followed owners at
// once, whenever the item sits on more than one of them lists.
export type CreditType = "like" | "inspired";

type CreditItem = { itemId: string; mediaType: InteractionMediaType };

export async function upsertCredits(
  supabase: SupabaseClient,
  actorUserId: string,
  ownerUserIds: string[],
  item: CreditItem,
  creditType: CreditType,
) {
  const rows = [...new Set(ownerUserIds)]
    .filter((ownerId) => ownerId !== actorUserId)
    .map((ownerId) => ({
      actor_user_id: actorUserId,
      owner_user_id: ownerId,
      item_id: item.itemId,
      media_type: item.mediaType,
      credit_type: creditType,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("interaction_credits")
    .upsert(rows, { onConflict: "actor_user_id,owner_user_id,item_id,media_type,credit_type" });
  if (error) {
    // Was previously swallowed silently -- surface it so a failure (RLS,
    // bad conflict target, ...) actually shows up in the browser console
    // instead of just quietly leaving "X Likes"/"X mal inspiriert" at 0.
    console.error("interaction_credits upsert failed", error, rows);
  }
}

/** Thin, explicit alias -- lib/rating-engine.ts's one entry point for granting "Lohnt sich"-Credits. */
export async function upsertLikeCredits(
  supabase: SupabaseClient,
  actorUserId: string,
  ownerUserIds: string[],
  item: CreditItem,
) {
  return upsertCredits(supabase, actorUserId, ownerUserIds, item, "like");
}

export async function clearLikeCredits(supabase: SupabaseClient, actorUserId: string, item: CreditItem) {
  const { error } = await supabase
    .from("interaction_credits")
    .delete()
    .eq("actor_user_id", actorUserId)
    .eq("item_id", item.itemId)
    .eq("media_type", item.mediaType)
    .eq("credit_type", "like");
  if (error) {
    console.error("interaction_credits cleanup failed", error);
  }
}

/** Mirrors removeInteraction, additionally clearing any like credits it had generated. */
export async function removeInteractionWithCredits(
  supabase: SupabaseClient,
  actorUserId: string,
  item: CreditItem,
) {
  const { error } = await removeInteraction(supabase, actorUserId, item.itemId, item.mediaType);
  if (error) return { error };

  await clearLikeCredits(supabase, actorUserId, item);
  return { error: null };
}

/**
 * Records "X mal inspiriert" credits for every followed owner an item was
 * adopted from. Independent of like credits -- adding an item you'd already
 * liked/owned never creates a new like credit, only this inspired one.
 */
export async function recordInspiredCredits(
  supabase: SupabaseClient,
  actorUserId: string,
  ownerUserIds: string[],
  item: CreditItem,
) {
  if (ownerUserIds.length === 0) return;
  await upsertCredits(supabase, actorUserId, ownerUserIds, item, "inspired");
}

/**
 * How many "inspired" credits actorUserId has recorded against each of
 * ownerUserIds -- one query, batched across many owners for one fixed
 * actor. Backs the FollowingBar's per-avatar inspiration count (Folgeänderungen
 * round, replacing the removed Taste-Match percentage badge) and the
 * foreign-profile "X-mal von Dir inspiriert" stat (single-owner case, see
 * getInspiredCount below) -- both read the exact same "übernommen" ledger,
 * never a separate/new counting scheme.
 */
export async function getInspiredCountBatch(
  supabase: SupabaseClient,
  actorUserId: string,
  ownerUserIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (ownerUserIds.length === 0) return result;

  const { data } = await supabase
    .from("interaction_credits")
    .select("owner_user_id")
    .eq("actor_user_id", actorUserId)
    .eq("credit_type", "inspired")
    .in("owner_user_id", ownerUserIds);

  for (const row of data ?? []) {
    result.set(row.owner_user_id, (result.get(row.owner_user_id) ?? 0) + 1);
  }
  return result;
}

/** Single-pair convenience wrapper around getInspiredCountBatch above. */
export async function getInspiredCount(
  supabase: SupabaseClient,
  actorUserId: string,
  ownerUserId: string,
): Promise<number> {
  const map = await getInspiredCountBatch(supabase, actorUserId, [ownerUserId]);
  return map.get(ownerUserId) ?? 0;
}

export type InspiredItem = {
  itemId: string;
  mediaType: InteractionMediaType;
  title: string;
  imageUrl: string | null;
  /** Menschlich lesbare Kategorie: "Film", "Serie" oder "Ort". */
  category: string;
  /** Aus welcher Liste des Profilbesitzers es stammt -- "Empfohlen"/"Watchlist" oder der Regionsname. */
  sourceListLabel: string;
  /** Link zur Liste des Profilbesitzers (keine Einzel-Item-Permalink-Route existiert im Projekt). */
  href: string;
};

/**
 * Batch-Auflösung der "X mal von Dir inspiriert"-Credits zu tatsächlich
 * anzeigbaren Items (Titel/Bild/Kategorie/Quelle) -- genau 3 Queries
 * insgesamt (Credits, Filme/Serien, Orte), nie ein Query pro Item. Die
 * Credit-Zeile selbst trägt keinen Titel/kein Bild (siehe upsertCredits
 * oben) -- item_id/media_type sind aber die echte TMDB-ID bzw. Google-
 * Place-ID, deshalb reicht ein Rück-Join auf die eigenen Listen des Actors.
 * Items ohne (mehr) passende Listen-Zeile (z. B. inzwischen entfernt) werden
 * stillschweigend ausgelassen, nie mit erfundenen Daten aufgefüllt.
 */
export async function getInspiredItems(
  supabase: SupabaseClient,
  actorUserId: string,
  ownerUserId: string,
  ownerUsername: string,
  limit = 50,
): Promise<InspiredItem[]> {
  const { data: creditRows } = await supabase
    .from("interaction_credits")
    .select("item_id, media_type")
    .eq("actor_user_id", actorUserId)
    .eq("owner_user_id", ownerUserId)
    .eq("credit_type", "inspired")
    .limit(limit);
  if (!creditRows || creditRows.length === 0) return [];

  const wantedKeys = new Set(creditRows.map((row) => `${row.media_type}:${row.item_id}`));
  const movieItemIds = [...new Set(creditRows.filter((r) => r.media_type !== "place").map((r) => Number(r.item_id)))];
  const placeIds = [...new Set(creditRows.filter((r) => r.media_type === "place").map((r) => r.item_id))];

  const [{ data: topListRows }, { data: watchlistRows }, { data: placeRows }] = await Promise.all([
    movieItemIds.length > 0
      ? supabase.from("top_list").select("item_id, media_type, title, image_url").eq("user_id", actorUserId).in("item_id", movieItemIds)
      : Promise.resolve({ data: [] as { item_id: number; media_type: string; title: string; image_url: string | null }[] }),
    movieItemIds.length > 0
      ? supabase.from("watchlist").select("item_id, media_type, title, image_url").eq("user_id", actorUserId).in("item_id", movieItemIds)
      : Promise.resolve({ data: [] as { item_id: number; media_type: string; title: string; image_url: string | null }[] }),
    placeIds.length > 0
      ? supabase
          .from("places")
          .select("google_place_id, name, photo_url, region_id, places_category")
          .eq("user_id", actorUserId)
          .in("google_place_id", placeIds)
      : Promise.resolve({
          data: [] as { google_place_id: string; name: string; photo_url: string | null; region_id: string; places_category: string }[],
        }),
  ]);

  const regionIds = [...new Set((placeRows ?? []).map((row) => row.region_id))];
  const { data: regionRows } =
    regionIds.length > 0
      ? await supabase.from("place_regions").select("id, region_name, region_key").in("id", regionIds)
      : { data: [] as { id: string; region_name: string; region_key: string }[] };
  const regionById = new Map((regionRows ?? []).map((row) => [row.id, row]));

  const items: InspiredItem[] = [];
  const seen = new Set<string>();

  for (const row of topListRows ?? []) {
    const key = `${row.media_type}:${row.item_id}`;
    if (!wantedKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    items.push({
      itemId: String(row.item_id),
      mediaType: row.media_type as InteractionMediaType,
      title: row.title,
      imageUrl: row.image_url,
      category: row.media_type === "tv" ? "Serie" : "Film",
      sourceListLabel: CATEGORY_LABELS.top_list,
      href: movieListHref(ownerUsername),
    });
  }
  for (const row of watchlistRows ?? []) {
    const key = `${row.media_type}:${row.item_id}`;
    if (!wantedKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    items.push({
      itemId: String(row.item_id),
      mediaType: row.media_type as InteractionMediaType,
      title: row.title,
      imageUrl: row.image_url,
      category: row.media_type === "tv" ? "Serie" : "Film",
      sourceListLabel: CATEGORY_LABELS.watchlist,
      href: movieListHref(ownerUsername),
    });
  }
  for (const row of placeRows ?? []) {
    const key = `place:${row.google_place_id}`;
    if (!wantedKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    const region = regionById.get(row.region_id);
    items.push({
      itemId: row.google_place_id,
      mediaType: "place",
      title: row.name,
      imageUrl: row.photo_url,
      category: "Ort",
      sourceListLabel: region?.region_name ?? "Orte",
      href: region ? `/u/${ownerUsername}/orte/${region.region_key}` : `/u/${ownerUsername}`,
    });
  }

  return items;
}
