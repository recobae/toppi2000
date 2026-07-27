"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Star, User, X } from "lucide-react";
import type { MovieDetails } from "@/lib/tmdb";

const PROFILE_BASE_URL = "https://image.tmdb.org/t/p/w185";

export function MovieMetaBadges({
  details,
  year,
  className,
}: {
  details: MovieDetails;
  year: string | null;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground ${className ?? ""}`}
    >
      {details.voteAverage != null && (
        <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
          {details.voteAverage.toFixed(1)}
          <Star className="size-3 fill-current text-yellow-500" />
        </span>
      )}
      {year && <span>{year}</span>}
      {details.runtimeMinutes != null && (
        <span>{details.runtimeMinutes} Min.</span>
      )}
      {details.genres.map((genre) => (
        <span
          key={genre}
          className="rounded bg-secondary text-secondary-foreground px-1.5 py-0.5 text-[10px] font-medium"
        >
          {genre}
        </span>
      ))}
    </div>
  );
}

export function MovieDetailModal({
  title,
  posterUrl,
  year,
  details,
  onClose,
}: {
  title: string;
  posterUrl: string | null;
  year: string | null;
  details: MovieDetails;
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-lg bg-background border p-4 flex flex-col gap-4"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Schließen"
          onClick={onClose}
          className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
        >
          <X className="size-4" />
        </button>

        <div className="flex gap-3 pr-8">
          <div className="relative w-20 aspect-[2/3] shrink-0 rounded-md overflow-hidden bg-muted">
            {posterUrl ? (
              <Image
                src={posterUrl}
                alt={title}
                fill
                sizes="80px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground text-center p-1">
                Kein Poster
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5 min-w-0">
            <p className="text-sm font-semibold leading-tight">{title}</p>
            <MovieMetaBadges details={details} year={year} />
            <span className="w-fit rounded border border-input px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {details.ageRating ? `FSK ${details.ageRating}` : "Keine Altersfreigabe"}
            </span>
            {details.director && (
              <p className="text-xs text-muted-foreground">
                Regie: {details.director}
              </p>
            )}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {details.overview || "Keine Beschreibung verfügbar."}
        </p>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            Besetzung
          </p>
          {details.cast.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Keine Besetzungsdaten verfügbar.
            </p>
          ) : (
            <div className="flex gap-3">
              {details.cast.map((actor) => (
                <div
                  key={actor.name}
                  className="flex flex-col items-center gap-1 w-16 shrink-0"
                >
                  <div className="relative size-12 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                    {actor.profilePath ? (
                      <Image
                        src={`${PROFILE_BASE_URL}${actor.profilePath}`}
                        alt={actor.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <User className="size-5 text-muted-foreground" />
                    )}
                  </div>
                  <span className="text-[10px] text-center leading-tight line-clamp-2">
                    {actor.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
