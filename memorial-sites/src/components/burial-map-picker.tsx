import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

const DEFAULT_CENTER: [number, number] = [37.6173, 55.7558] // Москва, [lng, lat]

// Публичный (не секретный) клиентский токен Mapbox — тот же уровень
// доверия, что и у publishable-ключа Stripe.
const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN as
  | string
  | undefined

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
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  // onChange даётся заново при каждом рендере — держим актуальную ссылку,
  // чтобы не пересоздавать карту и обработчик клика из-за неё.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !MAPBOX_TOKEN) return

    mapboxgl.accessToken = MAPBOX_TOKEN

    const center: [number, number] =
      lat !== undefined && lng !== undefined ? [lng, lat] : DEFAULT_CENTER

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom: lat !== undefined ? 15 : 4,
      attributionControl: false,
    })
    map.addControl(new mapboxgl.AttributionControl({ compact: true }))
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

    function placeMarker(markerLng: number, markerLat: number) {
      if (markerRef.current) {
        markerRef.current.setLngLat([markerLng, markerLat])
      } else {
        markerRef.current = new mapboxgl.Marker({ draggable: true })
          .setLngLat([markerLng, markerLat])
          .addTo(map)
        markerRef.current.on('dragend', () => {
          const pos = markerRef.current!.getLngLat()
          onChangeRef.current(pos.lat, pos.lng)
        })
      }
    }

    if (lat !== undefined && lng !== undefined) {
      placeMarker(lng, lat)
    }

    map.on('click', (e) => {
      placeMarker(e.lngLat.lng, e.lngLat.lat)
      onChangeRef.current(e.lngLat.lat, e.lngLat.lng)
    })

    mapRef.current = map
    requestAnimationFrame(() => map.resize())

    if (mapHandleRef) {
      mapHandleRef.current = {
        locate: () => {
          if (!navigator.geolocation) return
          navigator.geolocation.getCurrentPosition((position) => {
            const { latitude, longitude } = position.coords
            map.flyTo({ center: [longitude, latitude], zoom: 15 })
            placeMarker(longitude, latitude)
            onChangeRef.current(latitude, longitude)
          })
        },
      }
    }

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
      if (mapHandleRef) mapHandleRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg border bg-muted text-center text-sm text-muted-foreground">
        Карта недоступна: не задан VITE_MAPBOX_TOKEN
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      data-testid="burial-map"
    />
  )
}
