import { HeartHandshake } from "lucide-react";

const RING_SIZE = 20;
const RING_STROKE = 2;

/**
 * Shared progress ring (For Me hero, formerly also the removed movie/Orte
 * aggregate badges below the username -- that aggregated "Experte · 65
 * Filme"/"Local Experte · 54 Orte" text is gone now, superseded by the
 * per-list tier badges on each ListOverviewRow, which are more precise
 * since they're computed per list instead of summed across everything).
 */
export function ProgressRing({
  fraction,
  size = RING_SIZE,
  stroke = RING_STROKE,
  className,
}: {
  fraction: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, fraction)));
  return (
    <svg width={size} height={size} className={`-rotate-90 shrink-0 ${className ?? ""}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        className="stroke-muted"
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        className="stroke-primary transition-[stroke-dashoffset]"
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** "Mein Topf": how many recommenders this profile has thanked. Only rendered when > 0. */
export function ThanksStat({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <HeartHandshake className="size-4" />
      <span>{count} mal bedankt</span>
    </div>
  );
}
