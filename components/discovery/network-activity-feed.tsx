import Link from "next/link";
import { MapPin, List as ListIcon, Star, Bookmark, HeartHandshake } from "lucide-react";
import { describeNetworkActivityEvent, type NetworkActivityEvent, type NetworkActivityKind } from "@/lib/network-activity";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return "gerade eben";
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  return `vor ${days} ${days === 1 ? "Tag" : "Tagen"}`;
}

const ICON_BY_KIND: Record<NetworkActivityKind, typeof MapPin> = {
  new_region: ListIcon,
  place_added: MapPin,
  top_list_added: Star,
  watchlist_added: Bookmark,
  recommendation_added: HeartHandshake,
};

/**
 * Reine Aktivitätsmeldungen (keine Bewertungsaktion) -- Teil von "Gerade neu
 * von deinem Netzwerk" (Lohnt-sich-Umbau §4), ergänzt die bestehende
 * item-basierte "Neue Bewertungen von Freunden"-Section statt sie zu
 * ersetzen. Eine gemeinsame Darstellung für alle 5 Ereignis-Arten (Orte-
 * Liste, Ort, Top-Liste, Watchlist, Mein-Topf) -- nur Icon und Text
 * (describeNetworkActivityEvent) unterscheiden sich. Jede Zeile verlinkt auf
 * das Profil des Verursachers.
 */
export function NetworkActivityFeed({ events }: { events: NetworkActivityEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-1.5">
      {events.map((event, index) => {
        const Icon = ICON_BY_KIND[event.kind];
        return (
          <Link
            key={`${event.kind}-${event.actorUserId}-${index}`}
            href={`/u/${event.actorUsername}`}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-accent transition-colors"
          >
            <Icon className="size-3.5 shrink-0 text-primary" />
            <span className="flex-1 min-w-0 truncate">
              <span className="font-medium">{event.actorUsername}</span> {describeNetworkActivityEvent(event)}
            </span>
            <span className="shrink-0 text-muted-foreground">{timeAgo(event.createdAt)}</span>
          </Link>
        );
      })}
    </div>
  );
}
