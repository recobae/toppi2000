import Link from "next/link";
import { MapPin } from "lucide-react";
import type { RegionPrompt } from "@/lib/discovery";

/**
 * "Warst du schon mal hier?" -- cities the viewer's network already has
 * active Orte-lists for. Purely a nudge into building your own list there;
 * the actual "add a place" flow lives in Inspiration's Orte tab.
 */
export function RegionPrompts({ prompts }: { prompts: RegionPrompt[] }) {
  if (prompts.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-2.5">
      <h2 className="text-sm font-medium text-muted-foreground">Warst du schon mal hier?</h2>
      <div className="w-full flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {prompts.map((prompt) => (
          <Link
            key={prompt.key}
            href="/inspiration?tab=orte"
            className="shrink-0 flex flex-col gap-1 w-36 rounded-lg border p-3 hover:bg-accent transition-colors"
          >
            <MapPin className="size-4 text-primary" />
            <span className="text-sm font-medium truncate">{prompt.name}</span>
            <span className="text-[11px] text-muted-foreground leading-snug">
              {prompt.itemCount} {prompt.itemCount === 1 ? "Empfehlung" : "Empfehlungen"} von {prompt.friendCount}{" "}
              {prompt.friendCount === 1 ? "Freund" : "Freunden"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
