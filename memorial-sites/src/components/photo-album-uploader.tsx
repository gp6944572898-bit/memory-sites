import { useEffect, useRef, useState } from 'react'
import { useAction, useConvexAuth } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Loader2, Plus, X } from 'lucide-react'

import { api } from '@/../convex/_generated/api'

const MAX_DIMENSION = 1600

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function fileToWebp(file: File, quality = 0.85): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const image = await loadImage(dataUrl)

  let { width, height } = image
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.drawImage(image, 0, 0, width, height)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))),
      'image/webp',
      quality,
    )
  })
}

type PendingUpload = { id: string }

export function PhotoAlbumUploader({
  urls,
  onChange,
}: {
  urls: string[]
  onChange: (urls: string[]) => void
}) {
  const { isAuthenticated } = useConvexAuth()
  const { signIn } = useAuthActions()
  const createUpload = useAction(api.appFiles.createUpload)
  const finalizePhotoUpload = useAction(api.appFiles.finalizePhotoUpload)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingUpload[]>([])
  const [error, setError] = useState<string | null>(null)

  // Mirrors the `urls` prop so concurrent upload completions can append to
  // the latest value synchronously, instead of each closing over a stale
  // `urls` snapshot from when the upload started (which caused only the
  // last completed upload to "stick").
  const urlsRef = useRef(urls)
  useEffect(() => {
    urlsRef.current = urls
  }, [urls])

  function addUrl(url: string) {
    urlsRef.current = [...urlsRef.current, url]
    onChange(urlsRef.current)
  }

  function removeAt(index: number) {
    urlsRef.current = urlsRef.current.filter((_, i) => i !== index)
    onChange(urlsRef.current)
  }

  async function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) return
    event.target.value = ''
    setError(null)

    const newPending = files.map(() => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }))
    setPending((prev) => [...prev, ...newPending])

    if (!isAuthenticated) {
      try {
        await signIn('anonymous')
      } catch (err) {
        console.error('Anonymous sign-in failed', err)
      }
    }

    await Promise.all(
      files.map(async (file, index) => {
        const pendingId = newPending[index].id
        try {
          const blob = await fileToWebp(file)
          const filename = `album-${Date.now()}-${Math.random().toString(36).slice(2)}.webp`
          const grant = await createUpload({
            filename,
            contentType: 'image/webp',
            fileSize: blob.size,
            visibility: 'public',
          })
          const putResponse = await fetch(grant.uploadUrl, {
            method: grant.method,
            headers: grant.headers,
            body: blob,
          })
          if (!putResponse.ok) throw new Error(`Upload failed (${putResponse.status})`)
          const result = await finalizePhotoUpload({ fileId: grant.fileId })
          addUrl(result.url)
        } catch (err) {
          console.error('Album upload failed', err)
          setError('Не удалось загрузить одно или несколько фото')
        } finally {
          setPending((prev) => prev.filter((p) => p.id !== pendingId))
        }
      }),
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {urls.map((url, index) => (
          <div key={url} className="group relative aspect-square">
            <img
              src={url}
              alt=""
              className="h-full w-full rounded-lg object-cover"
            />
            <button
              type="button"
              onClick={() => removeAt(index)}
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/70 text-background"
              aria-label="Удалить фото"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {pending.map((p) => (
          <div
            key={p.id}
            className="flex aspect-square items-center justify-center rounded-lg bg-muted"
          >
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-muted-foreground/40 text-muted-foreground"
        >
          <Plus className="h-5 w-5" />
          <span className="text-xs">Добавить</span>
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFilesSelected}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
