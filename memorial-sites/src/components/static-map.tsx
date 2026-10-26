import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Публичный (не секретный) клиентский токен Mapbox — тот же уровень
// доверия, что и у publishable-ключа Stripe.
const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN as
  | string
  | undefined

export function StaticMap({ lat, lng }: { lat: number; lng: number }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return

    mapboxgl.accessToken = MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [lng, lat],
      zoom: 14,
      // Карта только для просмотра: перетаскивание, зум колесом/жестами,
      // двойным кликом и клавиатурой отключены — повторяет поведение
      // прежней статичной Leaflet-карты.
      interactive: false,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.AttributionControl({ compact: true }))
    new mapboxgl.Marker().setLngLat([lng, lat]).addTo(map)

    return () => map.remove()
  }, [lat, lng])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-56 w-full items-center justify-center rounded-lg border bg-muted text-center text-sm text-muted-foreground">
        Карта недоступна: не задан VITE_MAPBOX_TOKEN
      </div>
    )
  }

  return <div ref={containerRef} className="h-56 w-full rounded-lg" />
}
