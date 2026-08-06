"use client";

import { useState } from "react";
import Link from "next/link";
import { Film, MapPin, Plus, Sparkles, X } from "lucide-react";

/**
 * Replaces the old Orte-only "Ort hinzufügen" button (Design-Iteration 2,
 * Punkt 9) -- routes into whichever of the three existing, deliberately
 * separate save flows fits (movies/Serien, Orte, or the 16 fixed Mein-Topf
 * categories). Doesn't add a fourth, unified save path -- the project's
 * own architecture note in lib/recommendation-categories.ts explicitly
 * warns against that ("would create two parallel ways to save the same
 * kind of item"), so this is a router, not new save logic.
 */
export function NewListPicker() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center justify-center gap-2 h-14 w-full rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <Plus className="size-5" />
        <span className="text-sm font-medium">Neue Liste erstellen</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setIsOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Neue Liste erstellen"
        >
          <div
            className="relative w-full max-w-sm rounded-lg bg-background border p-4 flex flex-col gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Schließen"
              onClick={() => setIsOpen(false)}
              className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
            >
              <X className="size-4" />
            </button>
            <p className="text-sm font-medium pr-8 mb-2">Was möchtest du hinzufügen?</p>
            <Link
              href="/hinzufuegen"
              className="flex items-center gap-3 rounded-md border p-3 hover:bg-accent transition-colors"
            >
              <Film className="size-5 text-primary" />
              <span className="text-sm font-medium">Film oder Serie</span>
            </Link>
            <Link
              href="/hinzufuegen?tab=orte"
              className="flex items-center gap-3 rounded-md border p-3 hover:bg-accent transition-colors"
            >
              <MapPin className="size-5 text-primary" />
              <span className="text-sm font-medium">Ort</span>
            </Link>
            <Link
              href="/hinzufuegen?tab=sonstiges"
              className="flex items-center gap-3 rounded-md border p-3 hover:bg-accent transition-colors"
            >
              <Sparkles className="size-5 text-primary" />
              <span className="text-sm font-medium">Sonstiges (Mein Topf)</span>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
