"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { PREDEFINED_LIST_OPTIONS, type PredefinedListOption } from "@/lib/lists";

export function CreateListTile({
  existingTitles,
}: {
  existingTitles: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [creatingTitle, setCreatingTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const availableOptions = PREDEFINED_LIST_OPTIONS.filter(
    (option) => !existingTitles.includes(option.title),
  );

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleCreate = async (option: PredefinedListOption) => {
    setCreatingTitle(option.title);
    setError(null);

    try {
      const response = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: option.title }),
      });
      const data: { id?: string; error?: string } = await response.json();

      if (!response.ok || !data.id) {
        setError(data.error ?? "Liste konnte nicht erstellt werden.");
        setCreatingTitle(null);
        return;
      }

      router.push(`/lists/${data.id}`);
    } catch {
      setError("Liste konnte nicht erstellt werden.");
      setCreatingTitle(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex flex-col items-center justify-center gap-2 aspect-[2/3] w-full rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        <Plus className="size-8" />
        <span className="text-xs font-medium">Neue Liste</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Neue Liste erstellen"
            className="w-full sm:max-w-sm rounded-lg bg-background border p-4 flex flex-col gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Listentyp auswählen</p>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Schließen"
                className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-accent shrink-0"
              >
                <X className="size-4" />
              </button>
            </div>

            {availableOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Du hast bereits alle vorgeschlagenen Listen erstellt.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {availableOptions.map((option) => (
                  <button
                    key={option.title}
                    type="button"
                    disabled={creatingTitle === option.title}
                    onClick={() => handleCreate(option)}
                    className="min-h-11 text-left px-3 py-2 rounded-md border border-input hover:bg-accent transition-colors text-sm disabled:opacity-50"
                  >
                    {creatingTitle === option.title
                      ? "Wird erstellt…"
                      : option.title}
                  </button>
                ))}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
