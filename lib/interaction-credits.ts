import type { SupabaseClient } from "@supabase/supabase-js";
import { recordInteraction, removeInteraction, type InteractionMediaType } from "@/lib/interactions";

// Provenance ledger for the profile stats "X Likes" / "X mal inspiriert".
// Separate from item_interactions (which only ever holds ONE row per
// (user, item) -- the actor's own current stance) because a single like or
// add-to-list action must be able to credit MULTIPLE followed owners at
// once, whenever the item sits on more than one of them lists.
export type CreditType = "like" | "inspired";

type CreditItem = { itemId: string; mediaType: InteractionMediaType };

async function upsertCredits(
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

async function clearLikeCredits(supabase: SupabaseClient, actorUserId: string, item: CreditItem) {
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

/**
 * Records the actor's own like/dislike/skip stance on an item, and keeps
 * "X Likes" credits for every followed owner of that item in sync: a fresh
 * like credits all `ownerUserIds` (typically the people the item's card
 * showed as "Auf Top-Liste von" / "Empfohlen von"), while switching away
 * from like (dislike/skip) or liking an item with no known owner clears any
 * credit this actor previously handed out for it.
 */
export async function setInteractionWithCredits(
  supabase: SupabaseClient,
  actorUserId: string,
  item: CreditItem,
  interactionType: "like" | "dislike" | "skip",
  ownerUserIds: string[] = [],
) {
  const { error } = await recordInteraction(supabase, actorUserId, {
    itemId: item.itemId,
    mediaType: item.mediaType,
    interactionType,
  });
  if (error) return { error };

  if (interactionType === "like" && ownerUserIds.length > 0) {
    await upsertCredits(supabase, actorUserId, ownerUserIds, item, "like");
  } else {
    await clearLikeCredits(supabase, actorUserId, item);
  }
  return { error: null };
}

/** Mirrors removeInteraction, additionally clearing any like credits it had generated. */
export async function removeInteractionWithCredits(
  supabase: SupabaseClient,
  actorUserId: string,
  item: CreditItem,
) {
  await removeInteraction(supabase, actorUserId, item.itemId, item.mediaType);
  await clearLikeCredits(supabase, actorUserId, item);
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
