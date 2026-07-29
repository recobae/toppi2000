import Link from "next/link";
import type { ExpertiseLabelDefinition } from "@/lib/expertise";

export function ExpertiseBadges({
  labels,
}: {
  labels: ExpertiseLabelDefinition[];
}) {
  if (labels.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {labels.map((entry) => (
        <Link
          key={entry.key}
          href={entry.href}
          className="rounded-full bg-secondary text-secondary-foreground text-[11px] font-medium px-2.5 py-0.5 hover:bg-secondary/70 active:bg-secondary/60 transition-colors"
        >
          {entry.label}
        </Link>
      ))}
    </div>
  );
}
