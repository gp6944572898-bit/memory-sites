import type * as LeafletType from 'leaflet'

// Single place that decides which map tiles to use and adds them to a map.
// Mapbox when a token is configured (VITE_MAPBOX_TOKEN — a public, client-safe
// key, same trust level as a Stripe publishable key); falls back to plain
// OpenStreetMap tiles otherwise, so the map still works if the token is ever
// missing (e.g. a fresh environment that hasn't set it yet).
export function addBaseTileLayer(L: typeof LeafletType, map: LeafletType.Map) {
  const mapboxToken = (import.meta as any).env?.VITE_MAPBOX_TOKEN as
    | string
    | undefined

  if (mapboxToken) {
    L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
      {
        // Mapbox's own required credit, plus the OSM data it's built on.
        attribution:
          '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; OpenStreetMap contributors',
        tileSize: 512,
        zoomOffset: -1,
        maxZoom: 19,
      },
    ).addTo(map)
  } else {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
  }

  // Leaflet's default attribution prefix links to leafletjs.com and, since
  // 1.9, prepends a Ukrainian flag as the maintainers' show of support. Keep
  // the data attribution above (required by its license); drop only this
  // library-credit prefix and its flag.
  map.attributionControl.setPrefix(false)
}
