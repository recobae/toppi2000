import type { SupabaseClient } from "@supabase/supabase-js";
import type { MixGroup } from "@/lib/quick-swipe";
import type { DiscoverySourceType } from "@/lib/discovery";

export type QuickSwipeEventType = "like" | "dislike" | "battle_choice" | "detail_open";

/**
 * Best-effort instrumentation for the Quick-Swipe mixer -- like/dislike
 * ratio, Battle-Auswahlrate, and detail-view opens, each tagged with which
 * of the 6 mix groups the candidate came from (lib/quick-swipe.ts). Needs
 * the quick_swipe_events table (see the migration handed to the user
 * alongside this change) -- if it doesn't exist yet, the insert just fails
 * silently and nothing else breaks, same pattern as
 * lib/swipe-activity.ts#recordSwipeCardAction.
 */
export async function recordQuickSwipeEvent(
  supabase: SupabaseClient,
  userId: string,
  params: {
    eventType: QuickSwipeEventType;
    unitKind: "single" | "battle";
    sourceType: DiscoverySourceType;
    mixGroup?: MixGroup;
  },
) {
  const { error } = await supabase.from("quick_swipe_events").insert({
    user_id: userId,
    event_type: params.eventType,
    unit_kind: params.unitKind,
    source_type: params.sourceType,
    mix_group: params.mixGroup ?? null,
  });
  if (error) {
    console.error("quick swipe event tracking failed", error);
  }
}
