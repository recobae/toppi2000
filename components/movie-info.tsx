"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Ban, Check, Eye, Play, Star, User, X } from "lucide-react";
import type { MovieDetails, WatchProviderGroups } from "@/lib/tmdb";
import { WatchProviderBadges } from "@/components/watch-provider-badges";
import type {
  SocialProofBreakdown,
  SocialProofGroup,
} from "@/lib/hooks/use-social-proof";

const PROFILE_BASE_URL = "https://image.tmdb.org/t/p/w185";

function personHref(id: number, name: string) {
  return `/inspiration?person=${id}&name=${encodeURIComponent(name)}`;
}

export function SocialProofIcons({
  breakdown,
  onClick,
  className,
}: {
  breakdown?: SocialProofBreakdown;
  onClick?: () => void;
  className?: string;
}) {
  if (
    !breakdown ||
    (breakdown.positive.total === 0 &&
      breakdown.watchlist.total === 0 &&
      breakdown.dontWatch.total === 0)
  ) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 text-[10px] text-muted-foreground ${className ?? ""}`}
    >
      {breakdown.positive.total > 0 && (
        <span className="inline-flex items-center gap-0.5 text-green-600">
          <Check className="size-3" />
          {breakdown.positive.total}
        </span>
      )}
      {breakdown.watchlist.total > 0 && (
        <span className="inline-flex items-center gap-0.5">
          <Eye className="size-3" />
          {breakdown.watchlist.total}
        </span>
      )}
      {breakdown.dontWatch.total > 0 && (
        <span className="inline-flex items-center gap-0.5 text-destructive">
          <Ban className="size-3" />
          {breakdown.dontWatch.total}
        </span>
      )}
    </button>
  );
}

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

function SocialProofGroupRow({
  icon,
  label,
  group,
}: {
  icon: React.ReactNode;
  label: string;
  group: SocialProofGroup;
}) {
  if (group.total === 0) return null;

  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{label}: </span>
        {group.usernames.join(", ")}
      </p>
    </div>
  );
}

export function MovieDetailModal({
  title,
  posterUrl,
  year,
  details,
  tmdbId,
  mediaType,
  socialProof,
  note,
  watchProviders,
  onClose,
}: {
  title: string;
  posterUrl: string | null;
  year: string | null;
  details: MovieDetails;
  tmdbId: number;
  mediaType: "movie" | "tv";
  socialProof?: SocialProofBreakdown;
  note?: string | null;
  /** Full availability (flatrate + rent + buy) -- the card itself only ever shows the flatrate subset. */
  watchProviders?: WatchProviderGroups;
  onClose: () => void;
}) {
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [trailerChecked, setTrailerChecked] = useState(false);
  const [isLoadingTrailer, setIsLoadingTrailer] = useState(false);

  const handleShowTrailer = async () => {
    if (trailerChecked || isLoadingTrailer) return;
    setIsLoadingTrailer(true);
    try {
      const response = await fetch(
        `/api/trailer?id=${tmdbId}&mediaType=${mediaType}`,
      );
      if (response.ok) {
        const data: { key: string | null } = await response.json();
        setTrailerKey(data.key);
      }
    } catch {
      // no trailer available; keep showing just the poster
    } finally {
      setTrailerChecked(true);
      setIsLoadingTrailer(false);
    }
  };

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

  const hasSocialProof =
    socialProof &&
    (socialProof.positive.total > 0 ||
      socialProof.watchlist.total > 0 ||
      socialProof.dontWatch.total > 0);

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
            <button
              type="button"
              aria-label="Trailer abspielen"
              disabled={isLoadingTrailer}
              onClick={handleShowTrailer}
              className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors disabled:opacity-50"
            >
              <Play className="size-3 fill-current" />
            </button>
          </div>
          <div className="flex flex-col gap-1.5 min-w-0">
            <p className="text-sm font-semibold leading-tight">{title}</p>
            <MovieMetaBadges details={details} year={year} />
            <span className="w-fit rounded border border-input px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {details.ageRating ? `FSK ${details.ageRating}` : "Keine Altersfreigabe"}
            </span>
            {details.director && (
              <p className="text-xs text-muted-foreground">
                Regie:{" "}
                <Link
                  href={personHref(details.director.id, details.director.name)}
                  className="text-foreground hover:underline"
                >
                  {details.director.name}
                </Link>
              </p>
            )}
          </div>
        </div>

        {watchProviders && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">
              Verfügbarkeit
            </p>
            <WatchProviderBadges providers={watchProviders} title={title} />
          </div>
        )}

        {trailerKey && (
          <div className="relative w-full aspect-video rounded-md overflow-hidden bg-muted">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${trailerKey}`}
              title="Trailer"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          {details.overview || "Keine Beschreibung verfügbar."}
        </p>

        {note && (
          <div className="flex flex-col gap-1 rounded-md bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              Notiz
            </p>
            <p className="text-sm italic">„{note}“</p>
          </div>
        )}

        {hasSocialProof && socialProof && (
          <div className="flex flex-col gap-1.5 rounded-md bg-muted/50 p-3">
            <SocialProofGroupRow
              icon={<Check className="size-3.5 text-green-600" />}
              label="Gefällt"
              group={socialProof.positive}
            />
            <SocialProofGroupRow
              icon={<Eye className="size-3.5" />}
              label="Watchlist"
              group={socialProof.watchlist}
            />
            <SocialProofGroupRow
              icon={<Ban className="size-3.5 text-destructive" />}
              label="Overrated"
              group={socialProof.dontWatch}
            />
          </div>
        )}

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
                <Link
                  key={actor.id}
                  href={personHref(actor.id, actor.name)}
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
                  <span className="text-[10px] text-center leading-tight line-clamp-2 hover:underline">
                    {actor.name}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
