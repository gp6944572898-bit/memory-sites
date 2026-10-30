import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

// Те же параметры, что у QR-сервиса в админ-панели (уровень L, поле 2):
// минимум квадратов, код получается крупным и хорошо читается.
const OPTIONS = { errorCorrectionLevel: 'L' as const, margin: 2 }

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

  // SVG строит библиотека QR из нашего же адреса, а не из пользовательской
  // разметки, поэтому вставка безопасна.
  return (
    <div
      className={`[&>svg]:h-auto [&>svg]:w-full ${className ?? ''}`}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  )
}

// Скачивание QR как PNG для печати или отправки.
export async function downloadQrPng(text: string, name: string) {
  const url = await QRCode.toDataURL(text, { ...OPTIONS, width: 1000, type: 'image/png' })
  const link = document.createElement('a')
  link.href = url
  link.download = `qr-${name}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
}
