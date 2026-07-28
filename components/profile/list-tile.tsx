import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { ShareListButton } from "@/components/lists/share-list-button";

const SIZES = "(max-width: 640px) 33vw, 20vw";

export function ListTile({
  label,
  icon: Icon,
  posterUrls,
  itemCount,
  shareUrl,
  isExpanded,
  onToggle,
}: {
  label: string;
  icon: LucideIcon;
  posterUrls: string[];
  itemCount: number;
  shareUrl: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const posters = posterUrls.slice(0, 4);

  return (
    <div className="relative flex flex-col gap-2 rounded-lg border p-2 hover:bg-accent transition-colors">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="relative aspect-[2/3] w-full bg-muted rounded-md overflow-hidden"
      >
        {posters.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Icon className="size-8 text-muted-foreground" />
          </div>
        ) : posters.length === 1 ? (
          <Image
            src={posters[0]}
            alt={label}
            fill
            sizes={SIZES}
            className="object-cover"
          />
        ) : (
          <div className="grid grid-cols-2 grid-rows-2 h-full w-full gap-px">
            {Array.from({ length: 4 }).map((_, index) => {
              const poster = posters[index];
              return (
                <div key={index} className="relative bg-muted overflow-hidden">
                  {poster && (
                    <Image
                      src={poster}
                      alt={label}
                      fill
                      sizes={SIZES}
                      className="object-cover"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </button>
      <button type="button" onClick={onToggle} className="text-left">
        <div className="flex items-center gap-1">
          <Icon className="size-3.5 text-muted-foreground shrink-0" />
          <p className="text-sm font-medium leading-tight line-clamp-1">
            {label}
          </p>
          <span
            className="relative z-10"
            onClick={(event) => event.stopPropagation()}
          >
            <ShareListButton shareTitle={label} url={shareUrl} iconOnly />
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{itemCount} Titel</p>
      </button>
    </div>
  );
}
