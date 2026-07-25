import Image from "next/image";
import Link from "next/link";

export function ListTile({
  listId,
  label,
  posterUrl,
  itemCount,
}: {
  listId: string;
  label: string;
  posterUrl: string | null;
  itemCount: number;
}) {
  return (
    <Link
      href={`/lists/${listId}`}
      className="flex flex-col gap-2 rounded-lg border p-2 hover:bg-accent transition-colors"
    >
      <div className="relative aspect-[2/3] w-full bg-muted rounded-md overflow-hidden">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={label}
            fill
            sizes="(max-width: 640px) 33vw, 20vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground p-2 text-center">
            Kein Poster
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-medium leading-tight line-clamp-1">
          {label}
        </p>
        <p className="text-xs text-muted-foreground">{itemCount} Titel</p>
      </div>
    </Link>
  );
}
