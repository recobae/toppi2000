"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import type { WatchProvider, WatchProviderGroups } from "@/lib/tmdb";

const LOGO_BASE_URL = "https://image.tmdb.org/t/p/w45";
const PREVIEW_LIMIT = 3;

const GROUPS: { key: keyof WatchProviderGroups; label: string }[] = [
  { key: "flatrate", label: "Streamen" },
  { key: "rent", label: "Leihen" },
  { key: "buy", label: "Kaufen" },
];

function ProviderLogo({ provider }: { provider: WatchProvider }) {
  return (
    <Image
      src={`${LOGO_BASE_URL}${provider.logoPath}`}
      alt={provider.name}
      title={provider.name}
      width={24}
      height={24}
      className="rounded"
    />
  );
}

function ProviderGroupRow({
  label,
  entries,
}: {
  label: string;
  entries: WatchProvider[];
}) {
  if (entries.length === 0) return null;
  return (
    <div className="flex items-start gap-1">
      <span className="text-[10px] leading-6 text-muted-foreground w-12 shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {entries.map((provider) => (
          <ProviderLogo key={provider.providerId} provider={provider} />
        ))}
      </div>
    </div>
  );
}

export function WatchProviderBadges({
  providers,
  title,
}: {
  providers: WatchProviderGroups;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const totalCount =
    providers.flatrate.length + providers.rent.length + providers.buy.length;

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

  if (totalCount === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Aktuell nirgends verfügbar
      </p>
    );
  }

  if (totalCount <= PREVIEW_LIMIT) {
    return (
      <div className="flex flex-col gap-1">
        {GROUPS.map(({ key, label }) => (
          <ProviderGroupRow
            key={key}
            label={label}
            entries={providers[key]}
          />
        ))}
      </div>
    );
  }

  const preview = providers.flatrate.slice(0, PREVIEW_LIMIT);

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {preview.length > 0 && (
          <div className="flex gap-1">
            {preview.map((provider) => (
              <ProviderLogo key={provider.providerId} provider={provider} />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setIsOpen(true);
          }}
          className="inline-flex items-center text-[11px] text-primary underline-offset-2 hover:underline min-h-[44px] px-2 -mx-2"
        >
          Weitere Optionen anzeigen
        </button>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            event.stopPropagation();
            setIsOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Verfügbare Anbieter für ${title}`}
            className="w-full sm:max-w-sm max-h-[80vh] overflow-y-auto rounded-lg bg-background border p-4 flex flex-col gap-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium leading-tight">{title}</p>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsOpen(false);
                }}
                aria-label="Schließen"
                className="h-11 w-11 flex items-center justify-center rounded-md hover:bg-accent shrink-0"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {GROUPS.map(({ key, label }) => (
                <ProviderGroupRow
                  key={key}
                  label={label}
                  entries={providers[key]}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
