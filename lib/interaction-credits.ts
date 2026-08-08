import type { SupabaseClient } from "@supabase/supabase-js";
import { removeInteraction, type InteractionMediaType } from "@/lib/interactions";

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
