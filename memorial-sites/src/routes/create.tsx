import { useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { LocateFixed } from 'lucide-react'

import { api } from '@/../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { WizardProgress } from '@/components/wizard-progress'
import { EpitaphPicker } from '@/components/epitaph-picker'
import { PhotoUploader } from '@/components/photo-uploader'
import { PhotoAlbumUploader } from '@/components/photo-album-uploader'
import { VideoUploader } from '@/components/video-uploader'
import { BurialMapPicker, type BurialMapHandle } from '@/components/burial-map-picker'
import { RuDateInput } from '@/components/ru-date-input'
import { MemorialPreview, type MemorialTheme } from '@/components/memorial-preview'
import { OwnerLinkScreen } from '@/components/owner-link-screen'

export const Route = createFileRoute('/create')({
  component: CreatePage,
})

const PRICE_RUB = 8900

// Labels/swatches stay here (visual, not admin content); which of these an
// admin currently offers comes from content.getEnabledThemes.
const ALL_THEMES: { id: MemorialTheme; label: string; swatch: string }[] = [
  { id: 'light', label: 'Светлая тема', swatch: 'bg-white border border-neutral-300' },
  { id: 'dark', label: 'Тёмная тема', swatch: 'bg-neutral-900' },
]

const STEPS = [
  'name',
  'birth',
  'mainPhoto',
  'album',
  'epitaph',
  'bio',
  'video',
  'map',
  'theme',
  'payment',
] as const
type StepKey = (typeof STEPS)[number]

function CreatePage() {
  const enabledThemeIds = useQuery(api.content.getEnabledThemes, {})
  const themes = enabledThemeIds
    ? ALL_THEMES.filter((t) => enabledThemeIds.includes(t.id))
    : ALL_THEMES
  const navigate = useNavigate()
  const createPage = useMutation(api.pages.create)
  const mapHandleRef = useRef<BurialMapHandle | null>(null)

  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [deathDate, setDeathDate] = useState('')
  const [mainPhotoUrl, setMainPhotoUrl] = useState<string | undefined>(
    undefined,
  )
  const [photoAlbumUrls, setPhotoAlbumUrls] = useState<string[]>([])
  const [epitaph, setEpitaph] = useState<string>('')
  const [bioText, setBioText] = useState('')
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined)
  const [burialLat, setBurialLat] = useState<number | undefined>(undefined)
  const [burialLng, setBurialLng] = useState<number | undefined>(undefined)
  const [theme, setTheme] = useState<MemorialTheme | undefined>(undefined)

  const [stepIndex, setStepIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<{ slug: string; ownerToken: string } | null>(null)

  const steps = useMemo<readonly StepKey[]>(() => STEPS, [])
  const currentStep = steps[stepIndex]

  const fullName = useMemo(
    () =>
      [lastName, firstName, middleName]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' '),
    [lastName, firstName, middleName],
  )

  const isStepComplete = useMemo<Record<StepKey, boolean>>(
    () => ({
      name: lastName.trim() !== '' && firstName.trim() !== '',
      birth: birthDate !== '',
      mainPhoto: mainPhotoUrl !== undefined,
      album: photoAlbumUrls.length > 0,
      epitaph: epitaph.trim() !== '',
      bio: bioText.trim() !== '',
      video: videoUrl !== undefined,
      map: burialLat !== undefined && burialLng !== undefined,
      theme: theme !== undefined,
      payment: false,
    }),
    [
      lastName,
      firstName,
      birthDate,
      mainPhotoUrl,
      photoAlbumUrls.length,
      epitaph,
      bioText,
      videoUrl,
      burialLat,
      burialLng,
      theme,
    ],
  )

  function goNext() {
    setError(null)
    setStepIndex((i) => Math.min(i + 1, steps.length - 1))
  }

  function goBack() {
    setError(null)
    setStepIndex((i) => Math.max(i - 1, 0))
  }

  function handleNameNext() {
    if (!lastName.trim() || !firstName.trim()) {
      setError('Укажите фамилию и имя')
      return
    }
    goNext()
  }

  async function handlePublish() {
    setSubmitting(true)
    setError(null)
    try {
      const result = await createPage({
        fullName,
        birthDate,
        deathDate,
        epitaph,
        bioText,
        mainPhotoUrl,
        photoAlbumUrls: photoAlbumUrls.length > 0 ? photoAlbumUrls : undefined,
        videoUrl,
        burialLat,
        burialLng,
      })
      setCreated({ slug: result.slug, ownerToken: result.ownerToken })
    } catch (err) {
      console.error('Failed to create memorial page', err)
      setError('Не удалось создать страницу. Попробуйте ещё раз.')
      setSubmitting(false)
    }
  }

  // Theme step: the site preview is the full-screen base layer; the progress
  // capsule and theme card float on top as absolute overlays with a small
  // margin from the screen edges, but nothing in between them and the site
  // (no reserved flex row / padding block). z-[1000] because Leaflet's own
  // panes use z-index values up to ~700 and would otherwise draw over these.
  if (created) {
    return <OwnerLinkScreen slug={created.slug} ownerToken={created.ownerToken} />
  }

  if (currentStep === 'theme') {
    return (
      <main className="relative h-dvh overflow-hidden bg-background">
        <div className="absolute inset-0 overflow-y-auto">
          <MemorialPreview
            theme={theme ?? themes[0]?.id ?? 'light'}
            fullName={fullName}
            birthDate={birthDate}
            deathDate={deathDate}
            epitaph={epitaph}
            mainPhotoUrl={mainPhotoUrl}
            bioText={bioText}
            photoAlbumUrls={photoAlbumUrls}
            videoUrl={videoUrl}
            burialLat={burialLat}
            burialLng={burialLng}
          />
        </div>

        <div className="absolute left-4 right-4 top-3 z-[1000] rounded-xl border bg-card/80 px-4 py-1.5 shadow-lg backdrop-blur-md">
          <WizardProgress
            step={stepIndex + 1}
            total={steps.length}
            canGoBack={stepIndex > 0}
            canGoForward={isStepComplete.theme}
            onBack={goBack}
            onForward={goNext}
            showLabel={false}
          />
        </div>

        <div className="absolute bottom-4 left-4 right-4 z-[1000] rounded-xl border bg-card/80 p-3 shadow-lg backdrop-blur-md">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className={`flex w-28 shrink-0 flex-col items-center gap-2 rounded-2xl border p-3 ${
                  theme === t.id ? 'border-primary' : 'border-border'
                }`}
              >
                <span className={`h-10 w-full rounded-lg ${t.swatch}`} />
                <span className="text-xs text-foreground">{t.label}</span>
              </button>
            ))}
          </div>
          {theme !== undefined && (
            <Button className="mt-3 w-full" onClick={goNext}>
              Далее
            </Button>
          )}
        </div>
      </main>
    )
  }

  const isMapStep = currentStep === 'map'
  const isFullHeightStep =
    isMapStep ||
    currentStep === 'mainPhoto' ||
    currentStep === 'album' ||
    currentStep === 'bio' ||
    currentStep === 'video'

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background">
      <div className="shrink-0 px-6 pt-5">
        <WizardProgress
          step={stepIndex + 1}
          total={steps.length}
          canGoBack={stepIndex > 0}
          canGoForward={
            currentStep !== 'payment' && isStepComplete[currentStep]
          }
          onBack={goBack}
          onForward={goNext}
        />
      </div>

      <div
        className={`mx-auto flex w-full max-w-lg flex-1 flex-col px-6 py-4 ${
          isFullHeightStep ? 'min-h-0' : 'overflow-y-auto'
        }`}
      >
        {currentStep === 'name' && (
          <StepShell title="Как звали вашего близкого?">
            <div className="space-y-3">
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Фамилия"
                autoFocus
                className="text-lg"
              />
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Имя"
                className="text-lg"
              />
              <Input
                id="middleName"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                placeholder="Отчество"
                className="text-lg"
              />
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <Button className="mt-6 w-full" onClick={handleNameNext}>
              Далее
            </Button>
          </StepShell>
        )}

        {currentStep === 'birth' && (
          <StepShell title="Даты жизни">
            <div className="space-y-3">
              <RuDateInput
                value={birthDate}
                onChange={setBirthDate}
                placeholder="Дата рождения"
              />
              <RuDateInput
                value={deathDate}
                onChange={setDeathDate}
                placeholder="Дата смерти"
              />
            </div>
            <Button className="mt-6 w-full" onClick={goNext}>
              Далее
            </Button>
          </StepShell>
        )}

        {currentStep === 'mainPhoto' && (
          <SkippableStep
            title="Главное фото"
            canContinue={mainPhotoUrl !== undefined}
            onSkip={goNext}
            onContinue={goNext}
          >
            <PhotoUploader value={mainPhotoUrl} onChange={setMainPhotoUrl} />
          </SkippableStep>
        )}

        {currentStep === 'album' && (
          <SkippableStep
            title="Фотоальбом"
            canContinue={photoAlbumUrls.length > 0}
            onSkip={goNext}
            onContinue={goNext}
          >
            <PhotoAlbumUploader
              urls={photoAlbumUrls}
              onChange={setPhotoAlbumUrls}
            />
          </SkippableStep>
        )}

        {currentStep === 'epitaph' && (
          <StepShell title="Выберите эпитафию">
            <EpitaphPicker value={epitaph} onChange={setEpitaph} />
            <Button className="mt-6 w-full" onClick={goNext}>
              Далее
            </Button>
          </StepShell>
        )}

        {currentStep === 'bio' && (
          <SkippableStep
            title="История жизни"
            canContinue={bioText.trim() !== ''}
            onSkip={goNext}
            onContinue={goNext}
          >
            <Textarea
              value={bioText}
              onChange={(e) => setBioText(e.target.value)}
              rows={8}
              placeholder="Расскажите о жизни этого человека..."
              autoFocus
            />
          </SkippableStep>
        )}

        {currentStep === 'video' && (
          <SkippableStep
            title="Видео на память"
            canContinue={videoUrl !== undefined}
            onSkip={goNext}
            onContinue={goNext}
          >
            <VideoUploader value={videoUrl} onChange={setVideoUrl} />
          </SkippableStep>
        )}

        {currentStep === 'map' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <h1 className="mb-2 shrink-0 text-2xl font-semibold text-foreground">
              Место захоронения
            </h1>
            <div className="h-[42dvh] w-full shrink-0 overflow-hidden rounded-xl">
              <BurialMapPicker
                lat={burialLat}
                lng={burialLng}
                onChange={(lat, lng) => {
                  setBurialLat(lat)
                  setBurialLng(lng)
                }}
                mapHandleRef={mapHandleRef}
              />
            </div>
            <div className="mt-3 shrink-0 space-y-2">
              <p className="text-center text-xs text-muted-foreground">
                Выберите точку на карте
              </p>
              {burialLat === undefined || burialLng === undefined ? (
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => mapHandleRef.current?.locate()}
                  >
                    <LocateFixed className="mr-2 h-4 w-4" />
                    Моё местоположение
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={goNext}
                  >
                    Указать позже
                  </Button>
                </div>
              ) : (
                <Button className="w-full" onClick={goNext}>
                  Продолжить
                </Button>
              )}
            </div>
          </div>
        )}

        {currentStep === 'payment' && (
          <StepShell title="Осталось оплатить">
            <div className="space-y-4 rounded-xl border bg-card p-5">
              <p className="text-3xl font-semibold text-foreground">
                {PRICE_RUB.toLocaleString('ru-RU')} ₽
              </p>
              <p className="text-sm text-muted-foreground">
                Страница будет опубликована сразу. У вас есть 7 дней, чтобы
                собрать эту сумму — оплатить может как один человек, так и
                несколько родственников вместе. Если за 7 дней сумма не
                наберётся, страница останется, но в урезанном виде (только
                фото и имя).
              </p>
            </div>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <Button
              className="mt-6 w-full"
              onClick={handlePublish}
              disabled={submitting}
            >
              {submitting ? 'Публикуем…' : 'Опубликовать страницу'}
            </Button>
          </StepShell>
        )}
      </div>
    </main>
  )
}

function StepShell({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      {children}
    </div>
  )
}

function SkippableStep({
  title,
  canContinue,
  onSkip,
  onContinue,
  children,
}: {
  title: string
  canContinue: boolean
  onSkip: () => void
  onContinue: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {!canContinue && (
          <button
            type="button"
            onClick={onSkip}
            className="text-sm font-medium text-primary"
          >
            Пропустить
          </button>
        )}
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">{children}</div>
      {canContinue && (
        <Button className="mt-4 w-full shrink-0" onClick={onContinue}>
          Далее
        </Button>
      )}
    </div>
  )
}
