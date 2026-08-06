"use client";

import { MovieDetailModal } from "@/components/movie-info";
import { PlaceDetailModal } from "@/components/orte/place-detail-modal";
import type { MovieDetails } from "@/lib/tmdb";
import type { DiscoveryCandidate } from "@/lib/discovery";

const EMPTY_MOVIE_DETAILS: MovieDetails = {
  voteAverage: null,
  genres: [],
  runtimeMinutes: null,
  overview: "",
  cast: [],
  director: null,
  ageRating: null,
};

/**
 * The one global detail view for a DiscoveryCandidate, dispatched by
 * sourceType -- reuses MovieDetailModal (movie/tv) and PlaceDetailModal
 * (place/restaurant) as-is instead of building a second detail system.
 * All data comes from candidate.ref, pre-populated at candidate-build time
 * (lib/quick-swipe.ts) from the same TMDB/Google Places responses that
 * already produced the card, so opening this never needs a second fetch.
 * "topf" candidates have no detail view anywhere in the app yet and don't
 * currently appear in Quick-Swipe's own pool -- renders nothing rather than
 * guessing at a UI for them.
 */
export function CandidateDetailModal({
  candidate,
  onClose,
}: {
  candidate: DiscoveryCandidate;
  onClose: () => void;
}) {
  if (candidate.sourceType === "movie" || candidate.sourceType === "tv") {
    if (candidate.ref.tmdbId === undefined) return null;
    return (
      <MovieDetailModal
        title={candidate.title}
        posterUrl={candidate.imageUrl}
        year={candidate.ref.movieYear ?? null}
        details={candidate.ref.movieDetails ?? EMPTY_MOVIE_DETAILS}
        tmdbId={candidate.ref.tmdbId}
        mediaType={candidate.sourceType}
        watchProviders={candidate.ref.watchProviders}
        onClose={onClose}
      />
    );
  }

  if (candidate.sourceType === "place") {
    if (!candidate.ref.placeCategory) return null;
    return (
      <PlaceDetailModal
        name={candidate.title}
        address={candidate.location ?? ""}
        category={candidate.ref.placeCategory}
        photoUrl={candidate.imageUrl}
        lat={candidate.ref.lat ?? 0}
        lng={candidate.ref.lng ?? 0}
        googleMapsUri={candidate.ref.placeGoogleMapsUri}
        rating={candidate.rating}
        userRatingCount={candidate.ref.placeUserRatingCount}
        priceLevel={candidate.ref.placePriceLevel}
        phoneNumber={candidate.ref.placePhoneNumber}
        websiteUri={candidate.ref.placeWebsiteUri}
        openingStatus={candidate.ref.placeOpeningStatus}
        onClose={onClose}
      />
    );
  }

  return null;
}
