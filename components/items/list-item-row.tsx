"use client";

import Image from "next/image";
import type { MouseEvent, ReactNode } from "react";
import { Ban, Check, Heart, HeartHandshake, Pencil, Plus, Star, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MovieMetaBadges, SocialProofIcons } from "@/components/movie-info";
import { WatchProviderBadges } from "@/components/watch-provider-badges";
import { PlaceDetailsRow } from "@/components/orte/place-details-row";
import {
  PLACE_CATEGORY_ICONS,
  PLACE_CATEGORY_LABELS,
  type PlaceCategory,
  type PlacePriceLevel,
} from "@/lib/places";
import { truncateNote } from "@/lib/notes";
import type { SocialProofBreakdown } from "@/lib/hooks/use-social-proof";
import type { MovieDetails, WatchProviderGroups } from "@/lib/tmdb";
import type { OpeningStatus } from "@/lib/opening-hours";

/**
 * The single row layout used everywhere an item (movie/tv or place) is
 * listed: Inspiration (both tabs), a user's own Empfohlen/Watchlist/Orte
 * lists, the suggestion strips under those lists, and foreign profiles.
 * Only the action bar on the right changes -- via `actions` -- image,
 * title, meta content and friend-attribution lines are always identical.
 */

export type ListItemRowAttribution = { label: string; names: string[]; className?: string };

export type ListItemRowActions =
  | {
      /**
       * Unrated item: Gefällt mir / Nix für mich, plus Watchlist (movies) or
       * Merken (places). Used both for feed items with no owner yet, and --
       * with the write target swapped to the viewer's own lists -- for
       * items on someone else's list ("foreign" browsing), so the two
       * behave identically instead of a reduced action set. Only two
       * ratings exist anywhere in the app -- "Skip" was removed as its own
       * third concept (Master-Audit round); "Nix für mich" carries the same
       * 30-day resurfacing behavior Skip used to.
       */
      variant: "rate";
      onLike: () => void;
      onDislike: () => void;
      onAdd: () => void;
      addLabel: string;
      pending?: boolean;
      /** Foreign-list rows only: the viewer's own existing stance on this item, so the buttons reflect it instead of always looking unrated. */
      ownInteraction?: "like" | "dislike" | null;
    }
  | {
      /** Item already on one of the viewer's own lists. */
      variant: "owned";
      onEditNote: () => void;
      onRemove: () => void;
      isRemoving?: boolean;
      favorite?: { isFavorite: boolean; onToggle: () => void; pending?: boolean };
      /** Watchlist-only: switch straight to Like/Dislike without removing first. */
      statusTransition?: { onLike: () => void; onDislike: () => void; pending?: boolean };
    }
  | {
      /** Plain search results with no owner/friend context (e.g. Orte search) -- a single save toggle. */
      variant: "simple";
      isSaved: boolean;
      onToggleSave: () => void;
      pending?: boolean;
    }
  | {
      /**
       * "Mein Topf" recommender attribution row: thanking is a one-way,
       * server-enforced action (unique constraint on recommendation_thanks)
       * -- once `alreadyThanked`, the button stays permanently disabled,
       * never a toggle/"undo".
       */
      variant: "thank";
      alreadyThanked: boolean;
      onThank: () => void;
      pending?: boolean;
    };

function AttributionLines({ attribution }: { attribution?: ListItemRowAttribution[] }) {
  if (!attribution) return null;
  return (
    <>
      {attribution.map((entry) =>
        entry.names.length === 0 ? null : (
          <p key={entry.label} className={`text-[11px] text-muted-foreground ${entry.className ?? ""}`}>
            <span className="font-medium text-foreground">{entry.label}:</span> {entry.names.join(", ")}
          </p>
        ),
      )}
    </>
  );
}

/**
 * Exported so surfaces outside the row itself -- currently the StoryViewer's
 * embedded rate prompt -- can render the exact same Ja/Nein/Add bar rather
 * than reimplementing it.
 */
export function ActionBar({
  actions,
  guard,
}: {
  actions: ListItemRowActions;
  guard: (fn: () => void) => void;
}) {
  // Every button here must stop propagation -- ListItemRow's Card wraps the
  // whole row in a click-to-open-details handler, and these buttons sit
  // inside it.
  const stop = (fn: () => void) => (event: MouseEvent) => {
    event.stopPropagation();
    guard(fn);
  };

  if (actions.variant === "rate") {
    const likedByMe = actions.ownInteraction === "like";
    const dislikedByMe = actions.ownInteraction === "dislike";
    return (
      <div className="mt-auto pt-2 flex items-center gap-1.5">
        <button
          type="button"
          aria-label={likedByMe ? "Gefällt mir (bereits gesetzt)" : "Gefällt mir"}
          disabled={actions.pending}
          onClick={stop(actions.onLike)}
          className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
            likedByMe
              ? "border-green-600 bg-green-600/10 text-green-600"
              : "border-input text-green-600 hover:bg-green-600/10"
          }`}
        >
          <Heart className={`size-4 ${likedByMe ? "fill-current" : ""}`} />
        </button>
        <button
          type="button"
          aria-label={dislikedByMe ? "Nix für mich (bereits gesetzt)" : "Nix für mich"}
          disabled={actions.pending}
          onClick={stop(actions.onDislike)}
          className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
            dislikedByMe
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-input text-destructive hover:bg-destructive/10"
          }`}
        >
          <Ban className={`size-4 ${dislikedByMe ? "fill-current" : ""}`} />
        </button>
        <button
          type="button"
          disabled={actions.pending}
          onClick={stop(actions.onAdd)}
          className="ml-auto flex items-center gap-1 h-8 px-2.5 rounded-full bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          {actions.addLabel}
        </button>
      </div>
    );
  }

  if (actions.variant === "owned") {
    return (
      <div className="mt-auto pt-2 flex items-center gap-1.5 flex-wrap">
        {actions.favorite && (
          <button
            type="button"
            aria-label={actions.favorite.isFavorite ? "Favorit entfernen" : "Als Favorit markieren"}
            disabled={actions.favorite.pending}
            onClick={stop(actions.favorite.onToggle)}
            className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:opacity-50 ${
              actions.favorite.isFavorite
                ? "border-amber-500 text-amber-500"
                : "border-input text-muted-foreground hover:bg-accent"
            }`}
          >
            <Star className={`size-4 ${actions.favorite.isFavorite ? "fill-current" : ""}`} />
          </button>
        )}
        {actions.statusTransition && (
          <>
            <button
              type="button"
              aria-label="Zu Gefällt mir"
              disabled={actions.statusTransition.pending}
              onClick={stop(actions.statusTransition.onLike)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-green-600 hover:bg-green-600/10 transition-colors disabled:opacity-50"
            >
              <Heart className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Zu Gefällt mir nicht"
              disabled={actions.statusTransition.pending}
              onClick={stop(actions.statusTransition.onDislike)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-input text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              <Ban className="size-4" />
            </button>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          aria-label="Notiz bearbeiten"
          onClick={stop(actions.onEditNote)}
        >
          <Pencil />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={actions.isRemoving}
          onClick={stop(actions.onRemove)}
        >
          <X />
          {actions.isRemoving ? "Wird entfernt…" : "Entfernen"}
        </Button>
      </div>
    );
  }

  if (actions.variant === "simple") {
    return (
      <div className="mt-auto pt-2">
        <button
          type="button"
          disabled={actions.pending}
          onClick={stop(actions.onToggleSave)}
          className={`w-full flex items-center justify-center gap-1.5 h-9 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${
            actions.isSaved
              ? "border border-input hover:bg-accent"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          {actions.isSaved ? <Check className="size-4" /> : <Plus className="size-4" />}
          {actions.isSaved ? "Gespeichert" : "Hinzufügen"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-auto pt-2">
      <button
        type="button"
        aria-label={actions.alreadyThanked ? "Bereits bedankt" : "Bedanken"}
        disabled={actions.pending || actions.alreadyThanked}
        onClick={stop(actions.onThank)}
        className={`flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-colors disabled:opacity-50 ${
          actions.alreadyThanked
            ? "border-primary bg-primary/10 text-primary"
            : "border-input text-muted-foreground hover:bg-accent"
        }`}
      >
        <HeartHandshake className={`size-3.5 ${actions.alreadyThanked ? "fill-current" : ""}`} />
        {actions.alreadyThanked ? "Bedankt" : "Bedanken"}
      </button>
    </div>
  );
}

export function ListItemRow({
  imageUrl,
  imageAlt,
  imageAspect = "2/3",
  imageFallback,
  onOpenDetails,
  title,
  meta,
  note,
  attribution,
  actions,
  onGuestClick,
  isLoggedIn = true,
}: {
  imageUrl: string | null;
  imageAlt: string;
  imageAspect?: "2/3" | "4/3";
  imageFallback?: ReactNode;
  onOpenDetails?: () => void;
  title: ReactNode;
  meta?: ReactNode;
  note?: string | null;
  attribution?: ListItemRowAttribution[];
  actions: ListItemRowActions;
  /** Guests get redirected to sign-up instead of running the interactive action. */
  onGuestClick?: () => void;
  isLoggedIn?: boolean;
}) {
  const guard = (fn: () => void) => {
    if (!isLoggedIn) {
      onGuestClick?.();
      return;
    }
    fn();
  };

  return (
    <Card
      onClick={onOpenDetails}
      role={onOpenDetails ? "button" : undefined}
      tabIndex={onOpenDetails ? 0 : undefined}
      onKeyDown={
        onOpenDetails
          ? (event) => {
              // Only react when the Card itself is focused -- otherwise Enter/Space
              // on a nested action button would bubble here and double-fire.
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenDetails();
              }
            }
          : undefined
      }
      aria-label={onOpenDetails ? `Details zu ${imageAlt} anzeigen` : undefined}
      className={`overflow-hidden flex gap-3 p-3 ${onOpenDetails ? "cursor-pointer" : ""}`}
    >
      <div
        className={`relative w-16 shrink-0 rounded-md overflow-hidden bg-muted ${
          imageAspect === "4/3" ? "aspect-[4/3]" : "aspect-[2/3]"
        }`}
      >
        {imageUrl ? (
          <Image src={imageUrl} alt={imageAlt} fill sizes="64px" className="object-cover" />
        ) : (
          imageFallback
        )}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <p className="text-sm font-medium leading-tight line-clamp-2">{title}</p>
        {meta}
        <AttributionLines attribution={attribution} />
        {actions.variant === "rate" && actions.ownInteraction && (
          <p
            className={`text-[11px] font-medium ${
              actions.ownInteraction === "like" ? "text-green-600" : "text-destructive"
            }`}
          >
            {actions.ownInteraction === "like" ? "Auch von dir geliked" : "Auch von dir nicht gemocht"}
          </p>
        )}
        {note && (
          <p className="text-[11px] italic text-muted-foreground line-clamp-2">
            „{truncateNote(note)}“
          </p>
        )}
        <ActionBar actions={actions} guard={guard} />
      </div>
    </Card>
  );
}

export function MovieItemRow({
  imageUrl,
  title,
  year,
  movieDetails,
  watchProviders,
  note,
  socialProof,
  onOpenDetails,
  attribution,
  actions,
  onGuestClick,
  isLoggedIn = true,
}: {
  imageUrl: string | null;
  title: string;
  year: string | null;
  movieDetails?: MovieDetails;
  watchProviders?: WatchProviderGroups;
  note?: string | null;
  socialProof?: SocialProofBreakdown;
  onOpenDetails?: () => void;
  attribution?: ListItemRowAttribution[];
  actions: ListItemRowActions;
  onGuestClick?: () => void;
  isLoggedIn?: boolean;
}) {
  return (
    <ListItemRow
      imageUrl={imageUrl}
      imageAlt={title}
      imageAspect="2/3"
      imageFallback={
        <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground p-1 text-center">
          Kein Poster
        </div>
      }
      onOpenDetails={onOpenDetails}
      title={
        <>
          {title}
          {year && <span className="text-muted-foreground font-normal"> · {year}</span>}
        </>
      }
      meta={
        <>
          {movieDetails && <MovieMetaBadges details={movieDetails} year={year} />}
          {socialProof && (
            <SocialProofIcons breakdown={socialProof} onClick={onOpenDetails} className="mt-0.5" />
          )}
          {watchProviders && <WatchProviderBadges providers={watchProviders} title={title} />}
        </>
      }
      note={note}
      attribution={attribution}
      actions={actions}
      onGuestClick={onGuestClick}
      isLoggedIn={isLoggedIn}
    />
  );
}

export function PlaceItemRow({
  imageUrl,
  name,
  category,
  address,
  rating,
  userRatingCount,
  openingStatus,
  priceLevel,
  phoneNumber,
  websiteUri,
  note,
  onOpenDetails,
  attribution,
  actions,
  onGuestClick,
  isLoggedIn = true,
}: {
  imageUrl: string | null;
  name: string;
  category: PlaceCategory;
  address?: string | null;
  rating?: number | null;
  userRatingCount?: number | null;
  openingStatus?: OpeningStatus | null;
  priceLevel?: PlacePriceLevel | null;
  phoneNumber?: string | null;
  websiteUri?: string | null;
  note?: string | null;
  onOpenDetails?: () => void;
  attribution?: ListItemRowAttribution[];
  actions: ListItemRowActions;
  onGuestClick?: () => void;
  isLoggedIn?: boolean;
}) {
  const Icon = PLACE_CATEGORY_ICONS[category];
  return (
    <ListItemRow
      imageUrl={imageUrl}
      imageAlt={name}
      imageAspect="4/3"
      imageFallback={
        <div className="flex h-full items-center justify-center text-muted-foreground">
          <Icon className="size-5" />
        </div>
      }
      onOpenDetails={onOpenDetails}
      title={name}
      meta={
        <>
          <span className="inline-flex w-fit items-center gap-1 text-[10px] font-medium rounded bg-secondary text-secondary-foreground px-1.5 py-0.5">
            <Icon className="size-3" />
            {PLACE_CATEGORY_LABELS[category]}
          </span>
          {address && <p className="text-[11px] text-muted-foreground line-clamp-1">{address}</p>}
          <PlaceDetailsRow
            rating={rating}
            userRatingCount={userRatingCount}
            openingStatus={openingStatus}
            priceLevel={priceLevel}
            phoneNumber={phoneNumber}
            websiteUri={websiteUri}
          />
        </>
      }
      note={note}
      attribution={attribution}
      actions={actions}
      onGuestClick={onGuestClick}
      isLoggedIn={isLoggedIn}
    />
  );
}
