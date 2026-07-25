import Image from "next/image";
import type { PersonSummary } from "@/lib/tmdb";

const PROFILE_BASE_URL = "https://image.tmdb.org/t/p/w185";

export function PersonSelector({
  people,
  onSelect,
  label,
}: {
  people: PersonSummary[];
  onSelect: (person: PersonSummary) => void;
  label: string;
}) {
  return (
    <div className="w-full flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible">
        {people.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => onSelect(person)}
            className="flex flex-col items-center gap-1 shrink-0 w-16 text-center rounded-md py-1 hover:bg-accent"
          >
            <div className="relative h-14 w-14 rounded-full overflow-hidden bg-muted">
              {person.profilePath ? (
                <Image
                  src={`${PROFILE_BASE_URL}${person.profilePath}`}
                  alt={person.name}
                  fill
                  sizes="56px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
                  ?
                </div>
              )}
            </div>
            <span className="text-[11px] leading-tight line-clamp-2">
              {person.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
