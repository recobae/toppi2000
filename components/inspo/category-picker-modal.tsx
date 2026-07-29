"use client";

import { useEffect } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { CATEGORY_ICONS, CATEGORY_LABELS, VISIBLE_SAVED_CATEGORIES, type SavedCategory } from "@/lib/categories";

export function CategoryPickerModal({
  title,
  imageUrl,
  onPick,
  onClose,
}: {
  title: string;
  imageUrl: string | null;
  onPick: (category: SavedCategory) => void;
  onClose: () => void;
}) {
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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Zu welcher Liste?"
    >
      <div
        className="w-full max-w-sm rounded-lg bg-background border p-4 flex flex-col gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {imageUrl && (
            <div className="relative w-10 aspect-[2/3] shrink-0 rounded overflow-hidden bg-muted">
              <Image src={imageUrl} alt={title} fill sizes="40px" className="object-cover" />
            </div>
          )}
          <p className="flex-1 text-sm font-medium leading-tight line-clamp-2">{title}</p>
          <button
            type="button"
            aria-label="Schließen"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {VISIBLE_SAVED_CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICONS[category];
            return (
              <button
                key={category}
                type="button"
                onClick={() => onPick(category)}
                className="flex items-center gap-2 h-11 px-3 rounded-md border border-input text-sm font-medium hover:bg-accent transition-colors"
              >
                <Icon className="size-4" />
                {CATEGORY_LABELS[category]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
