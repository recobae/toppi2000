"use client";

import { useState } from "react";
import Image from "next/image";
import { ActionBar } from "@/components/items/list-item-row";
import { createClient } from "@/lib/supabase/client";
import { recordThanks, type RecommendationWithRecommenders } from "@/lib/topf";
import type { RecommendationCategory } from "@/lib/recommendation-categories";

/**
 * One "Mein Topf" item card: a summary header (title + thumbnail), then one
 * row per recommender attached to it (Abschnitt 2.2/5) -- each with its own
 * note and its own independent "thank" button, since multiple friends can
 * recommend the same item and each deserves their own acknowledgement.
 * Self-added entries (recommender === the pot owner) show as a plain
 * "Von dir hinzugefügt" line with no thank button -- thanking yourself
 * makes no sense.
 */
function CategoryRecommendationCard({
  item,
  userId,
  category,
  initiallyThankedIds,
  showToast,
}: {
  item: RecommendationWithRecommenders;
  userId: string;
  category: RecommendationCategory | undefined;
  initiallyThankedIds: Set<string>;
  showToast: (message: string) => void;
}) {
  const [thankedIds, setThankedIds] = useState(initiallyThankedIds);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleThank = async (recommenderId: string) => {
    if (pendingId) return;
    setPendingId(recommenderId);
    const supabase = createClient();
    const { error } = await recordThanks(supabase, recommenderId, userId);
    if (error) {
      showToast("Konnte nicht gespeichert werden, versuch's nochmal");
    } else {
      setThankedIds((prev) => new Set(prev).add(recommenderId));
    }
    setPendingId(null);
  };

  const imageUrl =
    item.metadata && typeof item.metadata.imageUrl === "string" ? (item.metadata.imageUrl as string) : null;
  const otherNames = item.recommenders
    .filter((recommender) => recommender.recommenderUserId !== userId)
    .map((recommender) => recommender.recommenderUsername)
    .filter(Boolean);

  return (
    <div className="rounded-lg border p-3 flex flex-col gap-2.5">
      <div className="flex gap-3">
        <div className="relative size-14 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center text-muted-foreground">
          {imageUrl ? (
            <Image src={imageUrl} alt="" fill sizes="56px" className="object-cover" />
          ) : (
            category && <category.icon className="size-5" />
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <p className="text-sm font-medium leading-tight">{item.title}</p>
          {otherNames.length > 0 && (
            <p className="text-[11px] text-muted-foreground">von {otherNames.join(", ")}</p>
          )}
          {item.note && (
            <p className="text-[11px] italic text-muted-foreground line-clamp-2">„{item.note}“</p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-border">
        {item.recommenders.map((recommender) =>
          recommender.recommenderUserId === userId ? (
            <p key={recommender.id} className="text-[11px] text-muted-foreground">
              Von dir hinzugefügt
            </p>
          ) : (
            <div key={recommender.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{recommender.recommenderUsername}</p>
                {recommender.note && recommender.note !== item.note && (
                  <p className="text-[11px] italic text-muted-foreground line-clamp-1">
                    „{recommender.note}“
                  </p>
                )}
              </div>
              <ActionBar
                actions={{
                  variant: "thank",
                  alreadyThanked: thankedIds.has(recommender.id),
                  onThank: () => handleThank(recommender.id),
                  pending: pendingId === recommender.id,
                }}
                guard={(fn) => fn()}
              />
            </div>
          ),
        )}
      </div>
    </div>
  );
}

export function CategoryList({
  items,
  userId,
  category,
  initiallyThankedIds,
}: {
  items: RecommendationWithRecommenders[];
  userId: string;
  category: RecommendationCategory | undefined;
  initiallyThankedIds: Set<string>;
}) {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div className="w-full flex flex-col gap-2">
      {items.map((item) => (
        <CategoryRecommendationCard
          key={item.id}
          item={item}
          userId={userId}
          category={category}
          initiallyThankedIds={initiallyThankedIds}
          showToast={showToast}
        />
      ))}

      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-md bg-foreground text-background px-4 py-2 text-sm shadow-lg">
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
}
