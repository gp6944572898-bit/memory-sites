import { useCallback, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { useAction } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useConvexAuth } from 'convex/react'
import {
  Contrast,
  ImagePlus,
  RotateCw,
  Sun,
  ZoomIn,
} from 'lucide-react'

import { api } from '@/../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { SliderWithZeroMark } from '@/components/slider-with-zero-mark'

// Square template used across memorial page photo slots (rendered with
// rounded corners in the UI via CSS, e.g. main photo avatar)
const TEMPLATE_ASPECT = 1

type ControlKey = 'zoom' | 'rotation' | 'brightness' | 'contrast'

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function getRadianAngle(degreeValue: number) {
  return (degreeValue * Math.PI) / 180
}

// Bounding box of the source image after it's rotated by `rotation` degrees.
function rotatedSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation)
  return {
    width:
      Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height:
      Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  }
}

async function cropToWebp(
  imageSrc: string,
  cropPixels: Area,
  rotation: number,
  brightness: number,
  contrast: number,
  quality = 0.85,
): Promise<Blob> {
  const image = await loadImage(imageSrc)

  const { width: rotW, height: rotH } = rotatedSize(
    image.width,
    image.height,
    rotation,
  )
  const rotatedCanvas = document.createElement('canvas')
  rotatedCanvas.width = rotW
  rotatedCanvas.height = rotH
  const rotatedCtx = rotatedCanvas.getContext('2d')
  if (!rotatedCtx) throw new Error('Canvas not supported')
  rotatedCtx.translate(rotW / 2, rotH / 2)
  rotatedCtx.rotate(getRadianAngle(rotation))
  rotatedCtx.drawImage(image, -image.width / 2, -image.height / 2)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(cropPixels.width)
  canvas.height = Math.round(cropPixels.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`
  ctx.drawImage(
    rotatedCanvas,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode image'))),
      'image/webp',
      quality,
    )
  })
}

export function PhotoUploader({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (url: string) => void
}) {
  const { isAuthenticated } = useConvexAuth()
  const { signIn } = useAuthActions()
  const createUpload = useAction(api.appFiles.createUpload)
  const finalizePhotoUpload = useAction(api.appFiles.finalizePhotoUpload)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [activeControl, setActiveControl] = useState<ControlKey | null>(null)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    setRotation(0)
    setBrightness(100)
    setContrast(100)
    setZoom(1)
    setCrop({ x: 0, y: 0 })
    setActiveControl(null)
    const reader = new FileReader()
    reader.onload = () => setRawImageSrc(reader.result as string)
    reader.readAsDataURL(file)
  }

  function toggleControl(key: ControlKey) {
    setActiveControl((current) => (current === key ? null : key))
  }

  async function handleConfirmCrop() {
    if (!rawImageSrc || !croppedAreaPixels) return
    setUploading(true)
    setError(null)
    try {
      if (!isAuthenticated) {
        await signIn('anonymous')
      }
      const blob = await cropToWebp(
        rawImageSrc,
        croppedAreaPixels,
        rotation,
        brightness,
        contrast,
      )
      const filename = `photo-${Date.now()}.webp`

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
      if (!putResponse.ok) {
        throw new Error(`Upload failed (${putResponse.status})`)
      }

      const result = await finalizePhotoUpload({ fileId: grant.fileId })
      onChange(result.url)
      setRawImageSrc(null)
    } catch (err) {
      console.error('Photo upload failed', err)
      setError('Не удалось загрузить фото. Попробуйте ещё раз.')
    } finally {
      setUploading(false)
    }
  }

  if (rawImageSrc) {
    return (
      <div className="space-y-4" data-testid="photo-cropper">
        <div className="relative h-72 w-full overflow-hidden rounded-2xl bg-muted [&_.reactEasyCrop_CropArea]:!rounded-2xl">
          <Cropper
            image={rawImageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={TEMPLATE_ASPECT}
            cropShape="rect"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            style={{
              mediaStyle: {
                filter: `brightness(${brightness}%) contrast(${contrast}%)`,
              },
            }}
          />
        </div>

        <div className="mt-2 flex w-full justify-between">
          <button
            type="button"
            aria-label="Масштаб"
            onClick={() => toggleControl('zoom')}
            className={`flex flex-1 items-center justify-center py-2 ${
              activeControl === 'zoom' || zoom !== 1
                ? 'text-primary'
                : 'text-foreground'
            }`}
          >
            <ZoomIn className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Поворот / выравнивание"
            onClick={() => toggleControl('rotation')}
            className={`flex flex-1 items-center justify-center py-2 ${
              activeControl === 'rotation' || rotation !== 0
                ? 'text-primary'
                : 'text-foreground'
            }`}
          >
            <RotateCw className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Яркость"
            onClick={() => toggleControl('brightness')}
            className={`flex flex-1 items-center justify-center py-2 ${
              activeControl === 'brightness' || brightness !== 100
                ? 'text-primary'
                : 'text-foreground'
            }`}
          >
            <Sun className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Контраст"
            onClick={() => toggleControl('contrast')}
            className={`flex flex-1 items-center justify-center py-2 ${
              activeControl === 'contrast' || contrast !== 100
                ? 'text-primary'
                : 'text-foreground'
            }`}
          >
            <Contrast className="h-5 w-5" />
          </button>
        </div>

        {activeControl && (
          <div className="px-1">
            {activeControl === 'zoom' && (
              <SliderWithZeroMark
                value={zoom}
                min={1}
                max={3}
                step={0.05}
                onValueChange={setZoom}
              />
            )}
            {activeControl === 'rotation' && (
              <SliderWithZeroMark
                value={rotation}
                min={-45}
                max={45}
                step={1}
                neutralValue={0}
                onValueChange={setRotation}
              />
            )}
            {activeControl === 'brightness' && (
              <SliderWithZeroMark
                value={brightness}
                min={50}
                max={150}
                step={1}
                neutralValue={100}
                onValueChange={setBrightness}
              />
            )}
            {activeControl === 'contrast' && (
              <SliderWithZeroMark
                value={contrast}
                min={50}
                max={150}
                step={1}
                neutralValue={100}
                onValueChange={setContrast}
              />
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="mt-8 flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setRawImageSrc(null)}
            disabled={uploading}
          >
            Отмена
          </Button>
          <Button type="button" onClick={handleConfirmCrop} disabled={uploading}>
            {uploading ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3" data-testid="photo-uploader">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />
      {value ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="block aspect-square w-full overflow-hidden rounded-2xl"
        >
          <img
            src={value}
            alt="Главное фото"
            className="h-full w-full object-cover"
          />
        </button>
      ) : (
        <>
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl bg-muted text-muted-foreground">
            <ImagePlus className="h-8 w-8" />
            <span className="text-sm">Фото не выбрано</span>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            Выбрать главную фотографию
          </Button>
        </>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
