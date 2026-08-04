import Image from "next/image";
import Link from "next/link";
import { MapPin, type LucideIcon } from "lucide-react";
import { ShareListButton } from "@/components/lists/share-list-button";
import { ExpertiseTierBadge } from "@/components/profile/expertise-tier-badge";
import type { ExpertiseTier } from "@/lib/expertise-tiers";

const PREVIEW_SIZE = "56px";

/** 2x2 photo collage (Pinterest-board style) -- used for Orte-region rows. */
function PhotoCollage({ photoUrls, icon: Icon }: { photoUrls: string[]; icon: LucideIcon }) {
  const photos = photoUrls.slice(0, 4);

  if (photos.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Icon className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (photos.length === 1) {
    return <Image src={photos[0]} alt="" fill sizes={PREVIEW_SIZE} className="object-cover" />;
  }

  return (
    <div className="grid grid-cols-2 grid-rows-2 h-full w-full gap-px">
      {Array.from({ length: 4 }).map((_, index) => {
        const photo = photos[index];
        return (
          <div key={index} className="relative bg-muted overflow-hidden">
            {photo && (
              <Image src={photo} alt="" fill sizes={PREVIEW_SIZE} className="object-cover" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Slightly overlapping stack of the newest 3-4 movie posters -- used for Empfohlen/Watchlist rows. */
function PosterStack({ posterUrls, icon: Icon }: { posterUrls: string[]; icon: LucideIcon }) {
  const posters = posterUrls.slice(0, 4);

  if (posters.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Icon className="size-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {posters.map((poster, index) => (
        <div
          key={poster + index}
          className="absolute inset-0 rounded-[3px] overflow-hidden ring-1 ring-background shadow-sm"
          style={{
            transform: `translateX(${index * 5}px) rotate(${(index - (posters.length - 1) / 2) * 6}deg)`,
            zIndex: index,
          }}
        >
          <Image src={poster} alt="" fill sizes={PREVIEW_SIZE} className="object-cover" />
        </div>
      ))}
    </div>
  );
}

export function ListOverviewRow({
  title,
  icon,
  preview,
  itemCount,
  noteCount,
  savedCount,
  href,
  shareUrl,
  tier,
  tierProgressLabel,
  isCurrentLocation,
  statsText,
}: {
  title: string;
  icon: LucideIcon;
  preview: { type: "collage" | "stack"; urls: string[] };
  itemCount: number;
  noteCount: number;
  /** Orte-only: count of items marked "Merken" (want_to_visit), shown separately from active recommendations. */
  savedCount?: number;
  href: string;
  shareUrl: string;
  /** Einsteiger renders no icon at all. */
  tier?: ExpertiseTier;
  /** Owner-only progress tooltip text, e.g. "42/60 bis Experte" -- omitted entirely for visitors. */
  tierProgressLabel?: string | null;
  /** Shows the "Wo bist du gerade" pin next to the title when this row matches it. */
  isCurrentLocation?: boolean;
  /** Overrides the default "N Einträge · ..." line, e.g. for the movies row's split empfohlen/gemerkt stats. */
  statsText?: string;
}) {
  return (
    <div className="relative flex items-center gap-3 rounded-lg border p-2.5 hover:bg-accent transition-colors">
      <div className="relative size-14 shrink-0 bg-muted rounded-md overflow-hidden">
        {preview.type === "collage" ? (
          <PhotoCollage photoUrls={preview.urls} icon={icon} />
        ) : (
          <PosterStack posterUrls={preview.urls} icon={icon} />
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium leading-tight truncate">{title}</p>
          {isCurrentLocation && (
            <MapPin
              aria-label="Aktueller Ort"
              className="size-3 shrink-0 fill-current text-primary"
            />
          )}
          {tier && (
            <span className="relative z-10">
              <ExpertiseTierBadge tier={tier} progressLabel={tierProgressLabel} />
            </span>
          )}
          <span className="relative z-10 ml-auto">
            <ShareListButton shareTitle={title} url={shareUrl} iconOnly />
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {statsText ?? (
            <>
              {itemCount} {itemCount === 1 ? "Eintrag" : "Einträge"}
              {noteCount > 0 && ` · ${noteCount} mit Notiz`}
              {typeof savedCount === "number" && savedCount > 0 && ` · ${savedCount} gemerkt`}
            </>
          )}
        </p>
      </div>
      <Link href={href} aria-label={title} className="absolute inset-0 z-0 rounded-lg" />
    </div>
  );
}
