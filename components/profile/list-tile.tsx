import Image from "next/image";
import Link from "next/link";
import { Film } from "lucide-react";
import { ShareListButton } from "@/components/lists/share-list-button";

const SIZES = "(max-width: 640px) 33vw, 20vw";

export function ListTile({
  listId,
  label,
  posterUrls,
  itemCount,
}: {
  listId: string;
  label: string;
  posterUrls: string[];
  itemCount: number;
}) {
  const posters = posterUrls.slice(0, 4);

  return (
    <div className="relative flex flex-col gap-2 rounded-lg border p-2 hover:bg-accent transition-colors">
      <div className="relative aspect-[2/3] w-full bg-muted rounded-md overflow-hidden">
        {posters.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Film className="size-8 text-muted-foreground" />
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
      </div>
      <div>
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium leading-tight line-clamp-1">
            {label}
          </p>
          <span className="relative z-10">
            <ShareListButton
              shareTitle={label}
              url={`/lists/${listId}`}
              iconOnly
            />
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{itemCount} Titel</p>
      </div>
      <Link
        href={`/lists/${listId}`}
        aria-label={label}
        className="absolute inset-0 z-0 rounded-lg"
      />
    </div>
  );
}
