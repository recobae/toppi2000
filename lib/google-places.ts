import { normalizePlaceCategory, type PlaceCategory } from "@/lib/places";

const PLACES_BASE_URL = "https://places.googleapis.com/v1";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PHOTO_MAX_WIDTH = 480;

export type PlaceSearchResult = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types: string[];
  category: PlaceCategory;
  photoUrl: string | null;
};

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  photos?: { name: string }[];
};

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
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.photos",
      },
      body: JSON.stringify({ textQuery: query, languageCode: "de" }),
    });
    if (!response.ok) return [];

    const data: { places?: GooglePlace[] } = await response.json();

    return (data.places ?? []).map((place) => {
      const types = place.types ?? [];
      const photoName = place.photos?.[0]?.name;
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
      };
    });
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
 * lists -- prefers a city-level match (Düsseldorf) but falls back to
 * broader administrative areas or the country for places without a clear
 * locality (e.g. villages on Bali resolve to the "Bali" province instead).
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
      findByType("administrative_area_level_2") ??
      findByType("administrative_area_level_1") ??
      findByType("country") ??
      null
    );
  } catch {
    return null;
  }
}
