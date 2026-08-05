"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, CircleMarker } from "leaflet";

export type MapPlace = { id: string; lat: number; lng: number; name: string };

const MARKER_RADIUS = 9;

/**
 * Thin Leaflet wrapper -- the only file that knows which map provider is in
 * use. Swapping to Google Maps later (e.g. once the project goes live and
 * wants Google's tile/marker styling) only means rewriting this one
 * component's internals; every caller just passes {id, lat, lng, name} and
 * gets an onSelectPlace(id) callback, regardless of provider.
 *
 * Leaflet + OpenStreetMap tiles chosen over the Google Maps JS API since it
 * needs no separate billed API key/script -- the project already only uses
 * the (unrelated) Places API key for search, never Maps JS.
 */
export function PlaceMapView({
  places,
  onSelectPlace,
}: {
  places: MapPlace[];
  onSelectPlace: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<CircleMarker[]>([]);
  // Always current inside the marker click handlers below without having to
  // tear down and recreate every marker whenever the callback identity changes.
  const onSelectRef = useRef(onSelectPlace);
  onSelectRef.current = onSelectPlace;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, { attributionControl: true }).setView([0, 0], 2);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap-Mitwirkende",
      }).addTo(map);
      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (cancelled || !map) return;

      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];

      if (places.length === 0) return;

      const style = getComputedStyle(document.documentElement);
      const primaryColor = `hsl(${style.getPropertyValue("--primary").trim()})`;

      const bounds = L.latLngBounds(places.map((place) => [place.lat, place.lng]));
      for (const place of places) {
        const marker = L.circleMarker([place.lat, place.lng], {
          radius: MARKER_RADIUS,
          color: "#fff",
          weight: 2,
          fillColor: primaryColor,
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip(place.name, { direction: "top", offset: [0, -MARKER_RADIUS] })
          .on("click", () => onSelectRef.current(place.id));
        markersRef.current.push(marker);
      }
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
    })();

    return () => {
      cancelled = true;
    };
  }, [places]);

  return (
    <div
      ref={containerRef}
      // isolate: Leaflet's internal panes/popups use z-index values up to
      // ~700, which -- without a stacking context boundary here -- could
      // render above unrelated fixed-position siblings like
      // PlaceDetailModal (z-50). isolate contains them regardless of their
      // absolute z-index number, so the modal always wins.
      className="isolate w-full h-[60vh] min-h-[320px] rounded-lg overflow-hidden border"
      role="application"
      aria-label="Kartenansicht der Orte"
    />
  );
}
