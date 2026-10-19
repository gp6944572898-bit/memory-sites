import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'

import { AdminGate, AdminShell } from '@/components/admin/admin-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  backend,
  PAGE_STATUS_LABEL,
  type Me,
  type PageRow,
  type PageStatus,
} from '@/lib/backend'

export const Route = createFileRoute('/pages')({ component: PagesRoute })

const FILTERS: { key: PageStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'pending_payment', label: 'В выкупе' },
  { key: 'reduced', label: 'Урезанные' },
  { key: 'blocked', label: 'Заблокированные' },
]

const STATUS_VARIANT: Record<PageStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  pending_payment: 'secondary',
  reduced: 'outline',
  blocked: 'destructive',
}

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`

function formatDate(value: string) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('ru-RU')
}

function formatTs(ms: number) {
  return new Date(ms).toLocaleDateString('ru-RU')
}

function participants(n: number) {
  const last = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return `${n} участников`
  if (last === 1) return `${n} участник`
  if (last >= 2 && last <= 4) return `${n} участника`
  return `${n} участников`
}

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function PagesRoute() {
  return (
    <AdminGate>
      {(me) => (
        <AdminShell me={me} title="Страницы">
          <PagesList me={me} />
        </AdminShell>
      )}
    </AdminGate>
  )
}

function PagesList({ me }: { me: Me }) {
  const [filter, setFilter] = useState<PageStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim(), 300)

  const result = useQuery(backend.pages, {
    ...(filter !== 'all' ? { status: filter } : {}),
    ...(query ? { search: query } : {}),
  })
  const canBlock = me.capabilities.includes('pages.block')

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={f.key === filter ? 'default' : 'outline'}
            className="shrink-0"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <Input
        type="search"
        placeholder="Поиск по имени или коду страницы"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {result === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : result.rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Ничего не найдено
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Найдено: {result.rows.length}
            {result.truncated && ' (показаны первые 200 — уточните поиск)'}
          </p>
          <div className="space-y-3">
            {result.rows.map((page) => (
              <PageCard key={page._id} page={page} canBlock={canBlock} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function campaignLine(page: PageRow) {
  const c = page.campaign
  if (!c) return null
  const state =
    c.status === 'active'
      ? `идёт до ${formatTs(c.deadlineAt)}`
      : c.status === 'completed'
        ? 'завершён'
        : 'истёк'
  return `Сбор: ${rub(c.collectedRub)} из ${rub(c.goalRub)} · ${participants(c.participantsCount)} · ${state}`
}

function PageCard({ page, canBlock }: { page: PageRow; canBlock: boolean }) {
  const setBlocked = useMutation(backend.setPageBlocked)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isBlocked = page.status === 'blocked'

  async function run(blocked: boolean) {
    setBusy(true)
    setError(null)
    try {
      await setBlocked({ pageId: page._id, blocked })
      setConfirming(false)
    } catch {
      setError('Не удалось выполнить действие. Проверьте права и повторите.')
    } finally {
      setBusy(false)
    }
  }

  const campaign = campaignLine(page)

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{page.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {formatDate(page.birthDate)} — {formatDate(page.deathDate)}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[page.status]} className="shrink-0">
            {PAGE_STATUS_LABEL[page.status]}
          </Badge>
        </div>

        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p>
            Создана {formatTs(page.createdAt)} · код {page.slug}
          </p>
          {page.ownerEmail && <p>Владелец: {page.ownerEmail}</p>}
          {campaign && <p>{campaign}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOpen((o) => !o)}>
            {open ? 'Скрыть' : 'Посмотреть'}
          </Button>

          {canBlock &&
            (isBlocked ? (
              <Button variant="outline" disabled={busy} onClick={() => void run(false)}>
                {busy ? 'Снимаю…' : 'Разблокировать'}
              </Button>
            ) : confirming ? (
              <>
                <Button variant="destructive" disabled={busy} onClick={() => void run(true)}>
                  {busy ? 'Блокирую…' : 'Да, заблокировать'}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
                  Отмена
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setConfirming(true)}>
                Заблокировать
              </Button>
            ))}
        </div>

        {confirming && !isBlocked && (
          <p className="text-xs text-muted-foreground">
            Страница пропадёт с сайта, запись в книге памяти и взносы будут
            закрыты. Блокировку можно снять.
          </p>
        )}
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        {open && <PageDetails pageId={page._id} />}
      </CardContent>
    </Card>
  )
}

function PageDetails({ pageId }: { pageId: string }) {
  const page = useQuery(backend.pageDetail, { pageId })

  if (page === undefined) return <Skeleton className="h-32 w-full" />
  if (page === null) {
    return <p className="text-sm text-muted-foreground">Страница не найдена</p>
  }

  const video = page.videoUrl && /^https?:\/\//i.test(page.videoUrl) ? page.videoUrl : null

  return (
    <div className="space-y-3 border-t pt-3 text-sm">
      {page.mainPhotoUrl && (
        <img
          src={page.mainPhotoUrl}
          alt=""
          loading="lazy"
          className="max-h-64 w-full rounded-md object-cover"
        />
      )}
      {page.epitaph && <p className="italic">{page.epitaph}</p>}
      {page.bioText && <p className="whitespace-pre-wrap">{page.bioText}</p>}
      <div className="space-y-0.5 text-xs text-muted-foreground">
        <p>Фото в альбоме: {page.albumCount}</p>
        {video && (
          <p>
            Видео:{' '}
            <a href={video} target="_blank" rel="noreferrer" className="underline">
              открыть
            </a>
          </p>
        )}
        {page.burialLat !== null && page.burialLng !== null && (
          <p>
            Место захоронения: {page.burialLat.toFixed(5)}, {page.burialLng.toFixed(5)}
          </p>
        )}
        <p>
          Проверка сообщений перед публикацией:{' '}
          {page.requireApproval ? 'включена' : 'выключена'}
        </p>
      </div>
    </div>
  )
}
