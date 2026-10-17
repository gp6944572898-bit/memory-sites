import { StaticMap } from '@/components/static-map'

export type MemorialTheme = 'light' | 'dark'

export function MemorialPreview({
  theme,
  fullName,
  birthDate,
  deathDate,
  epitaph,
  mainPhotoUrl,
  bioText,
  photoAlbumUrls,
  videoUrl,
  burialLat,
  burialLng,
}: {
  theme: MemorialTheme
  fullName: string
  birthDate: string
  deathDate: string
  epitaph: string
  mainPhotoUrl: string | undefined
  bioText: string
  photoAlbumUrls: string[]
  videoUrl: string | undefined
  burialLat: number | undefined
  burialLng: number | undefined
}) {
  const hasDates = Boolean(birthDate || deathDate)

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="min-h-full bg-background p-8 sm:p-12">
        <article className="mx-auto max-w-xl space-y-8">
          <header className="space-y-3 text-center">
            {mainPhotoUrl && (
              <img
                src={mainPhotoUrl}
                alt={fullName}
                className="mx-auto aspect-square w-full rounded-2xl object-cover"
              />
            )}
            <h1 className="text-3xl font-semibold text-foreground">
              {fullName || 'Имя не указано'}
            </h1>
            {hasDates && (
              <p className="text-muted-foreground">
                {birthDate || '—'} — {deathDate || '—'}
              </p>
            )}
            {epitaph && (
              <p className="italic text-foreground/80">{epitaph}</p>
            )}
          </header>

          {bioText && (
            <section className="space-y-2">
              <h2 className="text-lg font-medium text-foreground">
                История жизни
              </h2>
              <p className="whitespace-pre-wrap break-words text-foreground/90">
                {bioText}
              </p>
            </section>
          )}

          {photoAlbumUrls.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-medium text-foreground">
                Фотоальбом
              </h2>
              <div className="grid grid-cols-3 gap-2">
                {photoAlbumUrls.map((url) => (
                  <img
                    key={url}
                    src={url}
                    alt=""
                    className="aspect-square rounded-lg object-cover"
                  />
                ))}
              </div>
            </section>
          )}

          {videoUrl && (
            <section className="space-y-2">
              <h2 className="text-lg font-medium text-foreground">Видео</h2>
              <video src={videoUrl} controls className="w-full rounded-lg" />
            </section>
          )}

          {burialLat !== undefined && burialLng !== undefined && (
            <section className="space-y-2">
              <h2 className="text-lg font-medium text-foreground">
                Место памяти
              </h2>
              <StaticMap lat={burialLat} lng={burialLng} />
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              Книга памяти
            </h2>
            <p className="text-sm text-muted-foreground">
              Здесь гости смогут оставить слова памяти
            </p>
          </section>
        </article>
      </div>
    </div>
  )
}
