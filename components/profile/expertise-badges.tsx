import Link from "next/link";
import { MapPin } from "lucide-react";
import type { ExpertiseLabelDefinition } from "@/lib/expertise";

export function ExpertiseBadges({
  labels,
  homeCity,
}: {
  labels: ExpertiseLabelDefinition[];
  /** Shows a pin next to the tag matching this city instead of a separate line elsewhere on the profile. */
  homeCity?: string | null;
}) {
  if (labels.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {labels.map((entry) => (
        <Link
          key={entry.key}
          href={entry.href}
          className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground text-[11px] font-medium px-2.5 py-0.5 hover:bg-secondary/70 active:bg-secondary/60 transition-colors"
        >
          {homeCity && entry.label === homeCity && (
            <MapPin aria-label="Aktueller Ort" className="size-3 fill-current" />
          )}
          {entry.label}
        </Link>
      ))}
    </div>
  );
}
