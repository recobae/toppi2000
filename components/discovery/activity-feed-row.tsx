"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { RatingIconButton } from "@/components/ui/rating-icon-button";
import { RATING_LABELS } from "@/lib/copy";
import { describeNetworkActivityEvent, type NetworkActivityEvent } from "@/lib/network-activity";
import { timeAgo } from "@/lib/time-ago";
import type { DiscoveryCandidate } from "@/lib/discovery";
import type { RatingDecision } from "@/lib/rating-engine";

export type ActivityFeedEntry =
  | { kind: "rating"; at: string; candidate: DiscoveryCandidate }
  | { kind: "activity"; at: string; event: NetworkActivityEvent };

/**
 * Eine kompakte Zeilenform für "Neueste Bewertungen" (Profil-Umbau §7) --
 * ersetzt dort sowohl DiscoveryListRow (Karten-Format) als auch
 * NetworkActivityFeeds eigene Zeile durch EINE Form: Avatar, Username, Item/
 * Ereignis, Zeitpunkt rechts, bei bewertbaren Items direkt die globalen
 * RatingIconButtons (gleiche Komponente wie überall sonst, Phase A) inline.
 * Übereinstimmungs-/Diskrepanz-Hinweis wird nach dem Bewerten kurz
 * eingeblendet, exakt der gleiche Wortlaut wie list-item-row.tsx.
 */
export function ActivityFeedRow({
  entry,
  onRate,
  pending,
  justRated,
}: {
  entry: ActivityFeedEntry;
  onRate?: (decision: RatingDecision) => void;
  pending?: boolean;
  /** Gesetzt kurz nachdem der Betrachter selbst bewertet hat -- steuert den Übereinstimmungs-/Diskrepanz-Hinweis. */
  justRated?: RatingDecision | null;
}) {
  if (entry.kind === "activity") {
    const event = entry.event;
    return (
      <Link
        href={`/u/${event.actorUsername}`}
        className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-accent transition-colors"
      >
        <ProfileAvatar username={event.actorUsername} imageUrl={null} size="sm" />
        <span className="flex-1 min-w-0 text-xs truncate">
          <span className="font-medium">{event.actorUsername}</span> {describeNetworkActivityEvent(event)}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(event.createdAt)}</span>
      </Link>
    );
  }

  const candidate = entry.candidate;
  const actorUsername = candidate.sourceUsernames[0] ?? "Jemand";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -60, transition: { duration: 0.2 } }}
      className="flex flex-col gap-1.5 rounded-lg px-1 py-1.5"
    >
      <div className="flex items-center gap-2.5">
        <ProfileAvatar username={actorUsername} imageUrl={null} size="sm" />
        <span className="flex-1 min-w-0 text-xs truncate">
          <span className="font-medium">{actorUsername}</span> bewertet {candidate.title}:{" "}
          <span className="font-medium">{RATING_LABELS.lohnt_sich}</span>
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(entry.at)}</span>
      </div>
      <div className="flex items-center gap-2 pl-[42px]">
        <RatingIconButton
          decision="lohnt_sich"
          disabled={pending}
          onClick={() => onRate?.("lohnt_sich")}
        />
        <RatingIconButton
          decision="lohnt_sich_nicht"
          disabled={pending}
          onClick={() => onRate?.("lohnt_sich_nicht")}
        />
        <RatingIconButton
          decision="kenne_ich_nicht"
          disabled={pending}
          onClick={() => onRate?.("kenne_ich_nicht")}
        />
      </div>
      {justRated === "lohnt_sich" && (
        <p className="pl-[42px] text-[11px] font-medium text-green-600">
          Ihr seid euch einig – {actorUsername} und du finden: Das lohnt sich.
        </p>
      )}
      {justRated === "lohnt_sich_nicht" && (
        <p className="pl-[42px] text-[11px] font-medium text-muted-foreground">
          {actorUsername} empfiehlt es – du bist anderer Meinung.
        </p>
      )}
    </motion.div>
  );
}
