"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const TITLE_MAX_LENGTH = 80;

/**
 * System-account-only: creates an empty, region-unbound place_regions row
 * (e.g. "Die besten Bars der Welt") that then behaves exactly like any
 * other city list -- items get added to it via the normal "Lohnt sich"-Flow
 * (lib/rating-engine.ts) once it's selected in the city-chip bar.
 */
export function CreateFreeListModal({
  onCreate,
  onClose,
}: {
  onCreate: (title: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed || isSaving) return;
    setIsSaving(true);
    try {
      await onCreate(trimmed);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Freie Liste erstellen"
    >
      <div
        className="w-full max-w-sm rounded-lg bg-background border p-4 flex flex-col gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Freie Liste erstellen</p>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            Titel (z. B. „Die besten Bars der Welt“)
          </span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, TITLE_MAX_LENGTH))}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleCreate();
            }}
            autoFocus
            maxLength={TITLE_MAX_LENGTH}
            placeholder="Titel der Liste"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="flex-1 h-9 rounded-md border border-input text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={isSaving || !title.trim()}
            onClick={handleCreate}
            className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? "Erstellt…" : "Erstellen"}
          </button>
        </div>
      </div>
    </div>
  );
}
