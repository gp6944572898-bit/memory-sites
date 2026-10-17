import { useEffect, useRef } from 'react'
import type * as LeafletTypes from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_CENTER: [number, number] = [55.7558, 37.6173] // Moscow

export type BurialMapHandle = {
  locate: () => void
}

export function BurialMapPicker({
  lat,
  lng,
  onChange,
  mapHandleRef,
}: {
  lat: number | undefined
  lng: number | undefined
  onChange: (lat: number, lng: number) => void
  mapHandleRef?: React.MutableRefObject<BurialMapHandle | null>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletTypes.Map | null>(null)
  const markerRef = useRef<LeafletTypes.Marker | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    void (async () => {
      const L = (await import('leaflet')).default
      const markerIcon2x = (await import('leaflet/dist/images/marker-icon-2x.png')).default
      const markerIcon = (await import('leaflet/dist/images/marker-icon.png')).default
      const markerShadow = (await import('leaflet/dist/images/marker-shadow.png')).default

      if (cancelled || !containerRef.current || mapRef.current) return

      const defaultIcon = L.icon({
        iconUrl: markerIcon,
        iconRetinaUrl: markerIcon2x,
        shadowUrl: markerShadow,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
      })

      const center: [number, number] =
        lat !== undefined && lng !== undefined ? [lat, lng] : DEFAULT_CENTER

      const map = L.map(containerRef.current).setView(
        center,
        lat !== undefined ? 15 : 4,
      )
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)
      // Leaflet's default attribution prefix links to leafletjs.com and, since
      // 1.9, prepends a Ukrainian flag as the maintainers' show of support.
      // Keep the OSM data attribution above (required by its license); drop
      // only this library-credit prefix and its flag.
      map.attributionControl.setPrefix(false)

      if (lat !== undefined && lng !== undefined) {
        markerRef.current = L.marker([lat, lng], { icon: defaultIcon }).addTo(map)
      }

      map.on('click', (e: LeafletTypes.LeafletMouseEvent) => {
        const { lat: clickedLat, lng: clickedLng } = e.latlng
        if (markerRef.current) {
          markerRef.current.setLatLng([clickedLat, clickedLng])
        } else {
          markerRef.current = L.marker([clickedLat, clickedLng], {
            icon: defaultIcon,
          }).addTo(map)
        }
        onChange(clickedLat, clickedLng)
      })

      mapRef.current = map
      requestAnimationFrame(() => map.invalidateSize())

      if (mapHandleRef) {
        mapHandleRef.current = {
          locate: () => {
            if (!navigator.geolocation) return
            navigator.geolocation.getCurrentPosition((position) => {
              const { latitude, longitude } = position.coords
              map.setView([latitude, longitude], 15)
              if (markerRef.current) {
                markerRef.current.setLatLng([latitude, longitude])
              } else {
                markerRef.current = L.marker([latitude, longitude], {
                  icon: defaultIcon,
                }).addTo(map)
              }
              onChange(latitude, longitude)
            })
          },
        }
      }
    })()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
      if (mapHandleRef) mapHandleRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      data-testid="burial-map"
    />
  )
}
