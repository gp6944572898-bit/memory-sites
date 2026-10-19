import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

// Matches the old QR service (level L, margin 2): the fewest squares, so each
// one engraves as large as possible on stone. Tolerates only ~7% damage or
// dirt — less forgiving than M or H if the surface gets scratched, chipped,
// or grows moss/lichen over time.
const OPTIONS = { errorCorrectionLevel: 'L' as const, margin: 2 }

export type DownloadFormat = 'png' | 'jpg' | 'svg'

export const MIN_SIZE = 50
export const MAX_SIZE = 2000

export function clampSize(value: number) {
  if (!Number.isFinite(value)) return 500
  return Math.min(Math.max(Math.round(value), MIN_SIZE), MAX_SIZE)
}

export function QrImage({ text, className }: { text: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toString(text, { ...OPTIONS, type: 'svg' })
      .then((result) => {
        if (!cancelled) setSvg(result)
      })
      .catch(() => {
        if (!cancelled) setSvg(null)
      })
    return () => {
      cancelled = true
    }
  }, [text])

  // The SVG is produced by the QR library from our own text (site address +
  // code), never from user-typed markup.
  return (
    <div
      className={`[&>svg]:h-auto [&>svg]:w-full ${className ?? ''}`}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  )
}

function save(href: string, filename: string) {
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

// File name as in the old service: qr-<ID>-<size>px.<ext> (SVG has no size).
export function fileNameFor(name: string, format: DownloadFormat, size: number) {
  return format === 'svg' ? `qr-${name}.svg` : `qr-${name}-${size}px.${format}`
}

// SVG is vector — the right choice for engraving and print. PNG / JPG come at
// the chosen pixel size (50–2000).
export async function downloadQr(
  text: string,
  name: string,
  format: DownloadFormat,
  size: number,
) {
  const filename = fileNameFor(name, format, size)
  if (format === 'svg') {
    const svg = await QRCode.toString(text, { ...OPTIONS, type: 'svg' })
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    save(url, filename)
    URL.revokeObjectURL(url)
    return
  }
  const url = await QRCode.toDataURL(text, {
    ...OPTIONS,
    width: clampSize(size),
    type: format === 'jpg' ? 'image/jpeg' : 'image/png',
    rendererOpts: { quality: 0.92 },
  })
  save(url, filename)
}
