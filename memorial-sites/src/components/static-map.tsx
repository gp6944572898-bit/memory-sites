import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

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
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)
      // See burial-map-picker.tsx: drops Leaflet's default credit prefix
      // (and the Ukrainian-flag emoji it includes), keeping only the OSM
      // data attribution required by its license.
      map.attributionControl.setPrefix(false)
      L.marker([lat, lng], { icon }).addTo(map)
    })()

    return () => {
      map?.remove()
    }
  }, [lat, lng])

  return <div ref={containerRef} className="h-56 w-full rounded-lg" />
}
