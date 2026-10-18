import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import type { Id } from '@/../convex/_generated/dataModel'

import { api } from '@/../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { StaticMap } from '@/components/static-map'
import { ReportButton } from '@/components/report-dialog'
import { getDeviceKey } from '@/lib/device-key'

export const Route = createFileRoute('/m/$slug')({
  component: MemorialPage,
})

function formatRub(n: number): string {
  return Math.round(n).toLocaleString('ru-RU')
}

function formatDeadline(ts: number): string {
  return new Date(ts).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function MemorialPage() {
  const { slug } = Route.useParams()
  const page = useQuery(api.pages.getBySlug, { slug })

  if (page === undefined) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        data-state="loading"
      >
        <p className="text-muted-foreground">Загрузка…</p>
      </main>
    )
  }

  if (page === null) {
    return (
      <main
        className="min-h-screen flex items-center justify-center"
        data-state="error"
      >
        <p className="text-muted-foreground">Страница не найдена</p>
      </main>
    )
  }

  const reduced = page.status === 'reduced'
  const album = page.photoAlbumUrls ?? []
  const hasDates = Boolean(page.birthDate || page.deathDate)

  return (
    <main className="min-h-screen bg-background p-8 sm:p-12" data-state="ready">
      <article className="relative mx-auto max-w-xl space-y-8">
        <div className="absolute right-0 top-0">
          <ReportButton
            target={{ type: 'page', pageId: page._id }}
            label="Пожаловаться на страницу"
          />
        </div>
        <header className="text-center space-y-3">
          {page.mainPhotoUrl && (
            <img
              src={page.mainPhotoUrl}
              alt={page.fullName}
              className="mx-auto aspect-square w-full rounded-2xl object-cover"
            />
          )}
          <h1 className="text-3xl font-semibold text-foreground">
            {page.fullName}
          </h1>
          {hasDates && (
            <p className="text-muted-foreground">
              {page.birthDate || '—'} — {page.deathDate || '—'}
            </p>
          )}
          {page.epitaph && (
            <p className="italic text-foreground/80">{page.epitaph}</p>
          )}
        </header>

        {!reduced && page.bioText && (
          <section className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              История жизни
            </h2>
            <p className="whitespace-pre-wrap break-words text-foreground/90">
              {page.bioText}
            </p>
          </section>
        )}

        {!reduced && album.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              Фотоальбом
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {album.map((url) => (
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

        {!reduced && page.videoUrl && (
          <section className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">Видео</h2>
            <video src={page.videoUrl} controls className="w-full rounded-lg" />
          </section>
        )}

        {!reduced && page.burialLat !== undefined && page.burialLng !== undefined && (
          <section className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              Место памяти
            </h2>
            <StaticMap lat={page.burialLat} lng={page.burialLng} />
          </section>
        )}

        {reduced && (
          <p className="text-center text-sm text-muted-foreground">
            Полная версия страницы станет доступна после выкупа.
          </p>
        )}

        <Guestbook pageId={page._id} />

        <CampaignCard pageId={page._id} />
      </article>
    </main>
  )
}

function CampaignCard({ pageId }: { pageId: Id<'pages'> }) {
  const campaign = useQuery(api.campaigns.getByPage, { pageId })
  const [open, setOpen] = useState(false)

  if (campaign === undefined) return null
  if (campaign === null) return null
  if (campaign.status !== 'active') return null

  const pct = Math.min(
    100,
    Math.round((campaign.collectedRub / campaign.goalRub) * 100),
  )

  return (
    <section className="rounded-xl border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">
          {campaign.title}
        </h2>
        <span className="text-xs text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-base font-medium text-foreground">
          {formatRub(campaign.collectedRub)} ₽
        </span>
        <span className="text-xs text-muted-foreground">
          из {formatRub(campaign.goalRub)} ₽
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Приём средств до {formatDeadline(campaign.deadlineAt)}
      </p>
      {campaign.description && (
        <p className="text-xs text-muted-foreground">{campaign.description}</p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-full">Поддержать</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{campaign.title}</DialogTitle>
          </DialogHeader>
          <ContributionForm
            campaignId={campaign._id}
            allowAnonymous={campaign.allowAnonymous}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </section>
  )
}

const AMOUNT_CHIPS = [500, 1000, 3000, 5000]

function ContributionForm({
  campaignId,
  allowAnonymous,
  onDone,
}: {
  campaignId: Id<'campaigns'>
  allowAnonymous: boolean
  onDone: () => void
}) {
  const contribute = useMutation(api.campaigns.contribute)
  const [amount, setAmount] = useState<number>(AMOUNT_CHIPS[0])
  const [customAmount, setCustomAmount] = useState('')
  const [donorName, setDonorName] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelToken, setCancelToken] = useState<string | null>(null)

  const effectiveAmount = customAmount ? Number(customAmount) : amount

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!effectiveAmount || effectiveAmount <= 0) {
      setError('Укажите сумму взноса')
      return
    }
    if (!anonymous && !donorName.trim()) {
      setError('Укажите имя или отметьте «Анонимный взнос»')
      return
    }
    setSubmitting(true)
    try {
      const result = await contribute({
        campaignId,
        amountRub: effectiveAmount,
        donorName: donorName.trim() || undefined,
        anonymous,
        message: message.trim() || undefined,
      })
      setCancelToken(result.cancelToken)
    } catch (err) {
      console.error('Failed to contribute', err)
      setError(err instanceof Error ? err.message : 'Не удалось внести взнос')
    } finally {
      setSubmitting(false)
    }
  }

  if (cancelToken) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-foreground">
          Спасибо! Взнос {formatRub(effectiveAmount)} ₽ учтён.
        </p>
        <p className="text-xs text-muted-foreground">
          Ссылка для отмены взноса (сохраните, если решите вернуть его до
          завершения сбора):{' '}
          <code className="break-all">/contribution/{cancelToken}</code>
        </p>
        <Button className="w-full" onClick={onDone}>
          Готово
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">Сумма взноса</p>
        <div className="grid grid-cols-2 gap-2">
          {AMOUNT_CHIPS.map((chip) => (
            <Button
              key={chip}
              type="button"
              variant={!customAmount && amount === chip ? 'default' : 'outline'}
              onClick={() => {
                setAmount(chip)
                setCustomAmount('')
              }}
            >
              {formatRub(chip)} ₽
            </Button>
          ))}
        </div>
        <Input
          className="mt-2"
          type="number"
          placeholder="Своя сумма"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
        />
      </div>

      <div>
        <Input
          placeholder="Как к вам обращаться"
          value={donorName}
          onChange={(e) => setDonorName(e.target.value)}
          disabled={anonymous}
        />
      </div>

      {allowAnonymous && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={anonymous}
            onCheckedChange={(v) => setAnonymous(v === true)}
          />
          Анонимный взнос
        </label>
      )}

      <Textarea
        placeholder="Сообщение (необязательно)"
        rows={2}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting
          ? 'Обработка…'
          : `Внести ${formatRub(effectiveAmount || 0)} ₽`}
      </Button>
    </form>
  )
}

function Guestbook({ pageId }: { pageId: Id<'pages'> }) {
  const addMessage = useMutation(api.guestbook.submit)
  const { results: messages, status } = usePaginatedQuery(
    api.guestbook.list,
    { pageId },
    { initialNumItems: 20 },
  )

  const [authorName, setAuthorName] = useState('')
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    if (!authorName.trim() || !text.trim()) {
      setError('Заполните имя и сообщение')
      return
    }
    setSubmitting(true)
    try {
      const result = await addMessage({
        pageId,
        authorName,
        text,
        deviceKey: getDeviceKey(),
      })
      setAuthorName('')
      setText('')
      if (result.status !== 'published') {
        setNotice(
          'Сообщение отправлено на модерацию. После проверки оно появится на странице.',
        )
      }
    } catch (err) {
      console.error('Failed to add guestbook message', err)
      const tooFast = err instanceof Error && err.message.includes('Слишком много')
      setError(
        tooFast
          ? 'Вы отправляете слишком часто. Попробуйте чуть позже.'
          : 'Не удалось отправить сообщение',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium text-foreground">Книга памяти</h2>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          placeholder="Ваше имя"
          maxLength={60}
        />
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Оставьте слова памяти..."
          rows={3}
          maxLength={2000}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && (
          <p className="text-sm text-muted-foreground" role="status">
            {notice}
          </p>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Отправка…' : 'Оставить сообщение'}
        </Button>
      </form>

      <div className="space-y-3">
        {status === 'LoadingFirstPage' && (
          <p className="text-sm text-muted-foreground">Загрузка сообщений…</p>
        )}
        {status !== 'LoadingFirstPage' && messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Пока никто не оставил сообщение
          </p>
        )}
        {messages.map((message) => (
          <div key={message._id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground">
                {message.authorName}
              </p>
              <ReportButton
                target={{ type: 'message', messageId: message._id }}
                label="Пожаловаться"
              />
            </div>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
              {message.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
