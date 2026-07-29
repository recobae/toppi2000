import { normalizePlaceCategory, type PlaceCategory, type PlacePriceLevel } from "@/lib/places";
import { computeOpeningStatus, type OpeningPeriod, type OpeningStatus } from "@/lib/opening-hours";

const PLACES_BASE_URL = "https://places.googleapis.com/v1";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PHOTO_MAX_WIDTH = 480;

const SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.types",
  "places.photos",
  "places.googleMapsUri",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.regularOpeningHours",
  "places.utcOffsetMinutes",
].join(",");

export type PlaceSearchResult = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
  category: PlaceCategory;
  photoUrl: string | null;
  googleMapsUri: string | null;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: PlacePriceLevel | null;
  phoneNumber: string | null;
  websiteUri: string | null;
  openingStatus: OpeningStatus | null;
  /** Kept alongside openingStatus so a saved place can recompute it later, indefinitely, without another API call. */
  openingPeriods: OpeningPeriod[] | null;
  utcOffsetMinutes: number | null;
};

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  photos?: { name: string }[];
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { periods?: OpeningPeriod[] };
  utcOffsetMinutes?: number;
};

const PRICE_LEVEL_MAP: Record<string, PlacePriceLevel> = {
  PRICE_LEVEL_FREE: "free",
  PRICE_LEVEL_INEXPENSIVE: "inexpensive",
  PRICE_LEVEL_MODERATE: "moderate",
  PRICE_LEVEL_EXPENSIVE: "expensive",
  PRICE_LEVEL_VERY_EXPENSIVE: "very_expensive",
};

function mapPriceLevel(raw: string | undefined): PlacePriceLevel | null {
  return raw ? (PRICE_LEVEL_MAP[raw] ?? null) : null;
}

function mapGooglePlace(place: GooglePlace, apiKey: string): PlaceSearchResult {
  const types = place.types ?? [];
  const photoName = place.photos?.[0]?.name;
  const periods = place.regularOpeningHours?.periods ?? null;
  const utcOffsetMinutes = place.utcOffsetMinutes ?? null;

  return {
    placeId: place.id,
    name: place.displayName?.text ?? "Unbekannter Ort",
    address: place.formattedAddress ?? "",
    lat: place.location?.latitude ?? 0,
    lng: place.location?.longitude ?? 0,
    types,
    category: normalizePlaceCategory(types),
    photoUrl: photoName
      ? `${PLACES_BASE_URL}/${photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH}&key=${apiKey}`
      : null,
    googleMapsUri: place.googleMapsUri ?? null,
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? null,
    priceLevel: mapPriceLevel(place.priceLevel),
    phoneNumber: place.internationalPhoneNumber ?? null,
    websiteUri: place.websiteUri ?? null,
    openingStatus: computeOpeningStatus(periods, utcOffsetMinutes),
    openingPeriods: periods,
    utcOffsetMinutes,
  };
}

export async function searchPlaces(
  query: string,
  apiKey: string,
): Promise<PlaceSearchResult[]> {
  try {
    const response = await fetch(`${PLACES_BASE_URL}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": SEARCH_FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, languageCode: "de" }),
    });
    if (!response.ok) return [];

    const data: { places?: GooglePlace[] } = await response.json();
    return (data.places ?? []).map((place) => mapGooglePlace(place, apiKey));
  } catch {
    return [];
  }
}

type GeocodeAddressComponent = { long_name: string; types: string[] };
type GeocodeResponse = {
  results?: { address_components: GeocodeAddressComponent[] }[];
};

/**
 * Resolves the "region" a coordinate belongs to for the auto-clustered
 * lists -- prefers a city-level match (Düsseldorf) but falls back to the
 * broader province/state (administrative_area_level_1) for places without a
 * clear locality, since that's the name people actually recognize (e.g. a
 * village on Bali has no "locality" component at all in Google's response,
 * only the much more obscure regency "Gianyar" one level below -- nobody
 * calls themselves the "Gianyar expert"). The finer administrative_area_2
 * is checked only as a last resort before the country itself.
 */
export async function reverseGeocodeRegion(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<string | null> {
  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("language", "de");

    const response = await fetch(url);
    if (!response.ok) return null;

    const data: GeocodeResponse = await response.json();
    const components = data.results?.[0]?.address_components ?? [];

    const findByType = (type: string) =>
      components.find((component) => component.types.includes(type))
        ?.long_name;

    return (
      findByType("locality") ??
      findByType("administrative_area_level_1") ??
      findByType("administrative_area_level_2") ??
      findByType("country") ??
      null
    );
  } catch {
    return null;
  }
}
