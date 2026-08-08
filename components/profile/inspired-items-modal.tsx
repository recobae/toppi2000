"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { X, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getInspiredItems, type InspiredItem } from "@/lib/interaction-credits";

/**
 * Detailansicht für "X mal von Dir inspiriert" (Profil-Umbau, Punkt 5) --
 * gleiches Modal-Grundgerüst wie follower-list-modal.tsx, wiederverwendet
 * statt neu erfunden. Lädt erst beim Öffnen (nicht vorab auf der Profil-
 * seite), damit Profile, deren Statistik nie angeklickt wird, keine
 * zusätzliche Supabase-Last erzeugen.
 */
export function InspiredItemsModal({
  actorUserId,
  ownerUserId,
  ownerUsername,
  onClose,
}: {
  actorUserId: string;
  ownerUserId: string;
  ownerUsername: string;
  onClose: () => void;
}) {
  const [items, setItems] = useState<InspiredItem[] | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(false);
    setItems(null);
    const supabase = createClient();
    getInspiredItems(supabase, actorUserId, ownerUserId, ownerUsername)
      .then(setItems)
      .catch(() => setError(true));
  };

  useEffect(() => {
    load();
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Von dir bei ${ownerUsername} inspirierte Items`}
    >
      <div
        className="w-full max-w-sm max-h-[80vh] overflow-y-auto rounded-xl bg-background border p-5 flex flex-col gap-4 shadow-raised"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Von {ownerUsername} inspiriert</p>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        {error && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">Konnte nicht geladen werden.</p>
            <button type="button" onClick={load} className="text-sm font-medium text-primary hover:underline">
              Erneut versuchen
            </button>
          </div>
        )}

        {!error && items === null && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 animate-pulse">
                <div className="size-12 rounded-md bg-muted shrink-0" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="h-3 w-2/3 rounded bg-muted" />
                  <div className="h-2.5 w-1/3 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!error && items !== null && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Sparkles className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Noch keine inspirierten Items.</p>
          </div>
        )}

        {!error && items !== null && items.length > 0 && (
          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <Link
                key={`${item.mediaType}-${item.itemId}`}
                href={item.href}
                onClick={onClose}
                className="flex items-center gap-3 py-1.5 rounded-lg hover:bg-accent transition-colors -mx-1 px-1"
              >
                <div className="relative size-12 shrink-0 rounded-md overflow-hidden bg-muted">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt="" fill sizes="48px" className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Sparkles className="size-4 opacity-40" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {item.category} · aus {item.sourceListLabel}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
