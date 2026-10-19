import { useAction } from 'convex/react'
import { ImageOff, Loader2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { backend } from '@/lib/backend'

const MAX_BYTES = 5 * 1024 * 1024

// Reuses the same upload pipeline as the public site's page photos
// (convex/appFiles.ts) — a two-step grant-then-PUT flow, not local to this app.
export function ImageUploadField({
  value,
  onChange,
}: {
  value: string
  onChange: (url: string) => void
}) {
  const createUpload = useAction(backend.createUpload)
  const finalizeUpload = useAction(backend.finalizeUpload)
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Нужен файл изображения')
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Файл больше 5 МБ')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const grant = await createUpload({
        filename: file.name,
        contentType: file.type,
        fileSize: file.size,
        visibility: 'public',
      })
      const response = await fetch(grant.uploadUrl, {
        method: grant.method,
        headers: grant.headers,
        body: file,
      })
      if (!response.ok) throw new Error('upload failed')
      const { url } = await finalizeUpload({ fileId: grant.fileId })
      onChange(url)
    } catch {
      setError('Не удалось загрузить картинку')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="size-5 text-muted-foreground" />
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          {busy ? 'Загружаю…' : value ? 'Заменить картинку' : 'Загрузить картинку'}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
