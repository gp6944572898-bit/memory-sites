import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

import { addBaseTileLayer } from '@/lib/map-tiles'

export function StaticMap({ lat, lng }: { lat: number; lng: number }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let map: import('leaflet').Map | undefined

    void (async () => {
      const L = (await import('leaflet')).default
      const markerIcon2x = (await import('leaflet/dist/images/marker-icon-2x.png')).default
      const markerIcon = (await import('leaflet/dist/images/marker-icon.png')).default
      const markerShadow = (await import('leaflet/dist/images/marker-shadow.png')).default

      if (!containerRef.current) return

      const icon = L.icon({
        iconUrl: markerIcon,
        iconRetinaUrl: markerIcon2x,
        shadowUrl: markerShadow,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      })

      map = L.map(containerRef.current, {
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        zoomControl: false,
      }).setView([lat, lng], 14)
      // Единая логика выбора тайлов: Mapbox, если задан VITE_MAPBOX_TOKEN,
      // иначе запасной вариант — OpenStreetMap. Также убирает префикс
      // атрибуции Leaflet, оставляя только обязательную атрибуцию данных.
      addBaseTileLayer(L, map)
      L.marker([lat, lng], { icon }).addTo(map)
    })()

    return () => {
      map?.remove()
    }
  }, [lat, lng])

  return <div ref={containerRef} className="h-56 w-full rounded-lg" />
}
