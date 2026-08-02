import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { InteractionMediaType, InteractionType } from "@/lib/interactions";

export type OwnInteractionItem = { id: string; mediaType: InteractionMediaType };
export type OwnInteractionEntry = OwnInteractionItem & { interactionType: InteractionType };

function itemKey(id: string, mediaType: string): string {
  return `${mediaType}-${id}`;
}

function toMap(entries: OwnInteractionEntry[]): Record<string, InteractionType> {
  const map: Record<string, InteractionType> = {};
  for (const entry of entries) {
    map[itemKey(entry.id, entry.mediaType)] = entry.interactionType;
  }
  return map;
}

/**
 * The one place that resolves "does the current viewer already have an
 * opinion on this item" -- used everywhere an item shows up on someone
 * ELSE's list (foreign profile lists) so the Ja/Nein buttons reflect the
 * viewer's own like/dislike immediately, both on load and right after the
 * viewer rates something (via the returned `markOwn` setter, applied
 * optimistically instead of waiting for a refetch).
 *
 * `initial` lets a caller that already resolved the viewer's own
 * interactions server-side (the page already knows currentUserId) seed the
 * map directly and skip the client-side getUser()+item_interactions
 * roundtrip on mount entirely. Optional -- omitting it keeps the previous
 * client-only-fetch behavior for callers that haven't been updated.
 */
export function useOwnInteractions(items: OwnInteractionItem[], initial?: OwnInteractionEntry[]) {
  const [map, setMap] = useState<Record<string, InteractionType>>(() =>
    initial ? toMap(initial) : {},
  );
  const itemsKey = items.map((item) => itemKey(item.id, item.mediaType)).join(",");
  const hasInitial = initial !== undefined;

  useEffect(() => {
    if (hasInitial) return;
    if (items.length === 0) {
      setMap({});
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("item_interactions")
        .select("item_id, media_type, interaction_type")
        .eq("user_id", user.id)
        .in("interaction_type", ["like", "dislike"]);
      if (cancelled) return;

      const wanted = new Set(items.map((item) => itemKey(item.id, item.mediaType)));
      const next: Record<string, InteractionType> = {};
      for (const row of data ?? []) {
        const key = itemKey(row.item_id, row.media_type);
        if (wanted.has(key)) next[key] = row.interaction_type as InteractionType;
      }
      setMap(next);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, hasInitial]);

  const getOwn = (id: string, mediaType: InteractionMediaType): InteractionType | null =>
    map[itemKey(id, mediaType)] ?? null;

  const markOwn = (id: string, mediaType: InteractionMediaType, type: InteractionType) => {
    setMap((prev) => ({ ...prev, [itemKey(id, mediaType)]: type }));
  };

  return { getOwn, markOwn };
}
