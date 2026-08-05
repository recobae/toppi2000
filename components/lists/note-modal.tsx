"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Trash2, X } from "lucide-react";
import { NOTE_MAX_LENGTH } from "@/lib/notes";

export function NoteModal({
  title,
  posterUrl,
  initialNote,
  placeholder = "Warum empfiehlst du das?",
  maxLength = NOTE_MAX_LENGTH,
  label = "Deine Notiz dazu (optional)",
  onSave,
  onClose,
}: {
  title: string;
  posterUrl: string | null;
  initialNote: string | null;
  placeholder?: string;
  /** Defaults to the per-item note limit -- region-level tips pass a longer one. */
  maxLength?: number;
  label?: string;
  onSave: (note: string | null) => void | Promise<void>;
  onClose: () => void;
}) {
  const [note, setNote] = useState(initialNote ?? "");
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

  const handleSave = async (nextNote: string | null) => {
    setIsSaving(true);
    try {
      await onSave(nextNote);
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
      aria-label="Notiz"
    >
      <div
        className="w-full max-w-sm rounded-lg bg-background border p-4 flex flex-col gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {posterUrl && (
            <div className="relative w-10 aspect-[2/3] shrink-0 rounded overflow-hidden bg-muted">
              <Image src={posterUrl} alt={title} fill sizes="40px" className="object-cover" />
            </div>
          )}
          <p className="flex-1 text-sm font-medium leading-tight line-clamp-2">
            {title}
          </p>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <textarea
            value={note}
            onChange={(event) =>
              setNote(event.target.value.slice(0, maxLength))
            }
            maxLength={maxLength}
            rows={3}
            autoFocus
            placeholder={placeholder}
            className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
          <span className="self-end text-[10px] text-muted-foreground">
            {note.length}/{maxLength}
          </span>
        </label>

        <div className="flex items-center gap-2">
          {initialNote && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSave(null)}
              aria-label="Notiz löschen"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-input text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="size-4" />
            </button>
          )}
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="flex-1 h-9 rounded-md border border-input text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
          >
            {initialNote ? "Abbrechen" : "Ohne Notiz"}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSave(note.trim() || null)}
            className="flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? "Speichert…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
