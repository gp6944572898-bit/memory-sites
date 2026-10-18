import { useRef, useState } from 'react'
import { useAction, useConvexAuth } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Film, Loader2 } from 'lucide-react'

import { api } from '@/../convex/_generated/api'

const MAX_VIDEO_BYTES = 100 * 1024 * 1024 // 100MB

export function VideoUploader({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (url: string | undefined) => void
}) {
  const { isAuthenticated } = useConvexAuth()
  const { signIn } = useAuthActions()
  const createUpload = useAction(api.appFiles.createUpload)
  const finalizePhotoUpload = useAction(api.appFiles.finalizePhotoUpload)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    if (file.size > MAX_VIDEO_BYTES) {
      setError('Видео слишком большое (максимум 100 МБ)')
      return
    }
    setUploading(true)
    try {
      if (!isAuthenticated) {
        await signIn('anonymous')
      }
      const grant = await createUpload({
        filename: file.name,
        contentType: file.type || 'video/mp4',
        fileSize: file.size,
        visibility: 'public',
      })
      const putResponse = await fetch(grant.uploadUrl, {
        method: grant.method,
        headers: grant.headers,
        body: file,
      })
      if (!putResponse.ok) throw new Error(`Upload failed (${putResponse.status})`)
      const result = await finalizePhotoUpload({ fileId: grant.fileId })
      onChange(result.url)
    } catch (err) {
      console.error('Video upload failed', err)
      setError('Не удалось загрузить видео')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="space-y-2">
          <video src={value} controls className="w-full rounded-lg" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-sm text-muted-foreground underline"
          >
            Заменить видео
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 text-muted-foreground"
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Film className="h-6 w-6" />
          )}
          <span className="text-sm">
            {uploading ? 'Загрузка…' : 'Загрузить видео'}
          </span>
        </button>
      )}
      <p className="text-xs text-muted-foreground">
        Ограничение на размер файла — до 100 МБ
      </p>
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelected}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
