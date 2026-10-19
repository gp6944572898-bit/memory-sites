import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'

import { AdminGate, AdminShell } from '@/components/admin/admin-shell'
import {
  clampSize,
  downloadQr,
  fileNameFor,
  MAX_SIZE,
  MIN_SIZE,
  QrImage,
  type DownloadFormat,
} from '@/components/admin/qr-image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { backend, type QrHistoryItem, type QrRow, type QrSettings } from '@/lib/backend'

export const Route = createFileRoute('/qr')({ component: QrRoute })

const PAGE_SIZE = 20

const formatDate = (ms: number) => new Date(ms).toLocaleDateString('ru-RU')
const formatDateTime = (ms: number) =>
  new Date(ms).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function QrRoute() {
  return (
    <AdminGate>
      {(me) => (
        <AdminShell me={me} title="QR-коды">
          {me.capabilities.includes('qr.manage') ? (
            <QrPage />
          ) : (
            <p className="text-sm text-muted-foreground">Раздел доступен только главному админу.</p>
          )}
        </AdminShell>
      )}
    </AdminGate>
  )
}

function QrPage() {
  const [tab, setTab] = useState<'codes' | 'history'>('codes')
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2">
        <Button variant={tab === 'codes' ? 'default' : 'outline'} onClick={() => setTab('codes')}>
          Коды
        </Button>
        <Button variant={tab === 'history' ? 'default' : 'outline'} onClick={() => setTab('history')}>
          История
        </Button>
      </div>
      {tab === 'codes' ? <CodesTab /> : <HistoryTab />}
    </div>
  )
}

// ---- codes tab -------------------------------------------------------------

function CodesTab() {
  const settings = useQuery(backend.qrSettings, {})
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim(), 300)
  const [limit, setLimit] = useState(PAGE_SIZE)

  // A new search starts again from the first page.
  useEffect(() => setLimit(PAGE_SIZE), [query])

  const list = useQuery(backend.qrList, { limit, ...(query ? { search: query } : {}) })

  return (
    <div className="space-y-6">
      {settings === undefined ? <Skeleton className="h-40 w-full" /> : <SiteAddress settings={settings} />}
      <CreateCard />

      <div className="space-y-3">
        <Input
          type="search"
          placeholder="Поиск по названию, ID, ссылке или коду"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {list === undefined || settings === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : list.total === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {query ? (
              <>
                <p>Ничего не найдено</p>
                <p>Попробуйте другой запрос.</p>
              </>
            ) : (
              <>
                <p>Кодов пока нет</p>
                <p>Создайте первый выше — ссылку внутри него всегда можно будет поменять.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Показано {list.rows.length} из {list.total}
            </p>
            {list.rows.map((row) => (
              <QrCard key={row._id} row={row} settings={settings} />
            ))}
            {list.truncated && (
              <Button variant="outline" className="w-full" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                Показать ещё
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---- history tab -----------------------------------------------------------

function HistoryTab() {
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim(), 300)
  const [limit, setLimit] = useState(PAGE_SIZE)
  useEffect(() => setLimit(PAGE_SIZE), [query])

  const history = useQuery(backend.qrHistory, { limit, ...(query ? { search: query } : {}) })

  return (
    <div className="space-y-3">
      <Input
        type="search"
        placeholder="Поиск по названию, ID, ссылке или коду"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {history === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : history.total === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {query
            ? 'Ничего не найдено'
            : 'Как только вы поменяете ссылку у какого-то кода, запись появится здесь.'}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Показано {history.items.length} из {history.total}
          </p>
          {history.items.map((item) => (
            <HistoryCard key={item._id} item={item} />
          ))}
          {history.truncated && (
            <Button variant="outline" className="w-full" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
              Показать ещё
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function HistoryCard({ item }: { item: QrHistoryItem }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4 text-sm">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-medium">
            ID {item.numericId ?? '—'} · {item.label ?? 'без названия'}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(item.changedAt)}</span>
        </div>
        <div className="space-y-1 text-xs">
          <p className="break-all text-muted-foreground">
            <span className="font-medium text-foreground">Было:</span> {item.oldTarget}
          </p>
          <p className="break-all text-muted-foreground">
            <span className="font-medium text-foreground">Стало:</span> {item.newTarget}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ---- site address ----------------------------------------------------------

function SiteAddress({ settings }: { settings: QrSettings }) {
  const setBaseUrl = useMutation(backend.qrSetBaseUrl)
  const [value, setValue] = useState(settings.publicBaseUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      setValue(await setBaseUrl({ url: value }))
    } catch {
      setError('Не удалось сохранить. Нужен адрес вида https://ваш-домен.ru')
    } finally {
      setBusy(false)
    }
  }

  const state = !settings.publicBaseUrl
    ? { label: 'Не задан', variant: 'secondary' as const }
    : settings.isTemporary
      ? { label: 'Тестовый адрес', variant: 'destructive' as const }
      : { label: 'Готов к печати', variant: 'default' as const }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Адрес сайта в QR-кодах</CardTitle>
        <Badge variant={state.variant}>{state.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Этот адрес «зашивается» в картинку каждого кода (адрес/r/КОД). Пока домена нет, печатать коды
          нельзя: когда адрес сменится, напечатанные коды перестанут открываться. Меняется только то,
          куда ведёт код, а сама картинка остаётся прежней.
        </p>
        <Input
          inputMode="url"
          placeholder="https://ваш-домен.ru"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button disabled={busy || !value.trim()} onClick={() => void save()}>
          {busy ? 'Сохраняю…' : 'Сохранить адрес'}
        </Button>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---- choosing a page -------------------------------------------------------

function PagePicker({
  picked,
  onPick,
}: {
  picked: { id: string; name: string } | null
  onPick: (page: { id: string; name: string } | null) => void
}) {
  const [text, setText] = useState('')
  const query = useDebounced(text.trim(), 300)
  const result = useQuery(backend.pages, query.length >= 2 ? { search: query } : 'skip')

  if (picked) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="truncate">Страница: {picked.name}</span>
        <Button variant="ghost" onClick={() => onPick(null)}>
          Сменить
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Input
        placeholder="Найти страницу по имени или коду"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {result && result.rows.length === 0 && (
        <p className="text-xs text-muted-foreground">Ничего не найдено</p>
      )}
      {result?.rows.slice(0, 5).map((page) => (
        <Button
          key={page._id}
          variant="outline"
          className="w-full justify-start"
          onClick={() => onPick({ id: page._id, name: page.fullName })}
        >
          <span className="truncate">{page.fullName}</span>
        </Button>
      ))}
    </div>
  )
}

// ---- creating --------------------------------------------------------------

function CreateCard() {
  const create = useMutation(backend.qrCreate)
  const [mode, setMode] = useState<'page' | 'url'>('page')
  const [page, setPage] = useState<{ id: string; name: string } | null>(null)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<string | null>(null)

  const ready = mode === 'page' ? page !== null : url.trim().length > 0

  async function submit() {
    setBusy(true)
    setError(null)
    setCreated(null)
    try {
      const result = await create({
        ...(mode === 'page' && page ? { pageId: page.id } : {}),
        ...(mode === 'url' ? { targetUrl: url } : {}),
        ...(label.trim() ? { label } : {}),
      })
      setCreated(`ID ${result.numericId} · /r/${result.code}`)
      setPage(null)
      setUrl('')
      setLabel('')
    } catch {
      setError('Не удалось создать код. Укажите корректную ссылку, начинающуюся с http:// или https://')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Новый QR-код</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button variant={mode === 'page' ? 'default' : 'outline'} onClick={() => setMode('page')}>
            Страница памяти
          </Button>
          <Button variant={mode === 'url' ? 'default' : 'outline'} onClick={() => setMode('url')}>
            Внешняя ссылка
          </Button>
        </div>

        {mode === 'page' ? (
          <PagePicker picked={page} onPick={setPage} />
        ) : (
          <Input
            inputMode="url"
            placeholder="https://example.com/куда-ведёт-код"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        )}

        <Input
          placeholder="Название (необязательно), например «Памятник»"
          value={label}
          maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
        />

        <Button disabled={busy || !ready} onClick={() => void submit()}>
          {busy ? 'Создаю…' : 'Создать QR-код'}
        </Button>
        {created && (
          <p className="text-xs text-muted-foreground" role="status">
            Код создан: {created}. Он в списке ниже.
          </p>
        )}
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---- one code --------------------------------------------------------------

type Panel = 'none' | 'details' | 'edit' | 'download'

function targetLine(row: QrRow) {
  if (!row.target) return 'Страница удалена — код никуда не ведёт'
  if (row.target.kind === 'url') return `Ведёт на: ${row.target.url}`
  return `Ведёт на страницу: ${row.target.pageName}${row.target.pageBlocked ? ' (заблокирована)' : ''}`
}

function QrCard({ row, settings }: { row: QrRow; settings: QrSettings }) {
  const update = useMutation(backend.qrUpdate)
  const remove = useMutation(backend.qrRemove)
  const [panel, setPanel] = useState<Panel>('none')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const link = settings.publicBaseUrl ? `${settings.publicBaseUrl}/r/${row.code}` : null
  const title =
    row.label ??
    (row.target?.kind === 'page' ? row.target.pageName : row.target?.kind === 'url' ? row.target.url : row.code)
  const disabled = row.status === 'disabled'

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
    } catch {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }

  function copy() {
    if (!link) return
    void navigator.clipboard.writeText(link).then(() => setMessage(`Ссылка скопирована: ${link}`))
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          {link && <QrImage text={link} className="w-[88px] shrink-0 rounded border bg-white" />}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate font-medium">{title}</p>
              <Badge variant={disabled ? 'secondary' : 'default'} className="shrink-0">
                {disabled ? 'Отключён' : 'Работает'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              ID {row.numericId ?? '—'} · /r/{row.code}
            </p>
            <p className="break-all text-xs text-muted-foreground">{targetLine(row)}</p>
            <p className="text-xs text-muted-foreground">
              Сканирований: {row.scanCount}
              {row.lastScanAt && ` · последнее ${formatDateTime(row.lastScanAt)}`}
            </p>
            <p className="text-xs text-muted-foreground">Изменён {formatDateTime(row.updatedAt)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPanel(panel === 'edit' ? 'none' : 'edit')}>
            Изменить
          </Button>
          <Button variant="outline" onClick={() => setPanel(panel === 'download' ? 'none' : 'download')}>
            Скачать
          </Button>
          <Button variant="outline" disabled={!link} onClick={copy}>
            Копировать
          </Button>
          <Button variant="outline" onClick={() => setPanel(panel === 'details' ? 'none' : 'details')}>
            Статистика
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(
                () => update({ qrId: row._id, status: disabled ? 'active' : 'disabled' }),
                'Не удалось выполнить действие',
              )
            }
          >
            {disabled ? 'Включить' : 'Отключить'}
          </Button>
          <Button variant="outline" className="text-destructive" onClick={() => setConfirmingDelete(true)}>
            Удалить
          </Button>
        </div>

        {confirmingDelete && (
          <div className="space-y-2 rounded-md border border-destructive/40 p-3">
            <p className="text-xs">
              Удалить этот QR-код? Напечатанная картинка перестанет работать. История изменений сохранится.
              Если сомневаетесь, лучше отключите код: это можно отменить.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => void run(() => remove({ qrId: row._id }), 'Не удалось удалить код')}
              >
                {busy ? 'Удаляю…' : 'Да, удалить'}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Отмена
              </Button>
            </div>
          </div>
        )}

        {panel === 'edit' && <EditPanel row={row} onDone={() => setPanel('none')} />}
        {panel === 'download' && <DownloadPanel row={row} settings={settings} link={link} />}
        {panel === 'details' && <DetailsPanel row={row} link={link} />}

        {message && (
          <p className="break-all text-xs text-muted-foreground" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function DownloadPanel({
  row,
  settings,
  link,
}: {
  row: QrRow
  settings: QrSettings
  link: string | null
}) {
  const [format, setFormat] = useState<DownloadFormat>('png')
  const [preset, setPreset] = useState<'100' | '500' | 'custom'>('500')
  const [custom, setCustom] = useState('800')
  const [busy, setBusy] = useState(false)

  const canPrint = Boolean(link) && !settings.isTemporary
  const size = preset === 'custom' ? clampSize(Number(custom) || 500) : Number(preset)
  const name = row.numericId ?? row.code

  return (
    <div className="space-y-3 border-t pt-3">
      {!link ? (
        <p className="text-sm text-muted-foreground">Сначала укажите адрес сайта выше: он нужен для картинки кода.</p>
      ) : (
        <>
          {settings.isTemporary && (
            <p className="text-xs text-destructive">
              Адрес тестовый: код с ним перестанет работать при переезде. Скачивание закрыто, пока не задан
              настоящий домен.
            </p>
          )}

          <div className="grid grid-cols-3 gap-2">
            {(['png', 'jpg', 'svg'] as const).map((f) => (
              <Button key={f} variant={format === f ? 'default' : 'outline'} onClick={() => setFormat(f)}>
                {f.toUpperCase()}
              </Button>
            ))}
          </div>

          {format === 'svg' ? (
            <p className="text-xs text-muted-foreground">
              SVG — вектор: подходит для печати и гравировки, размер можно менять без потери качества.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <Button variant={preset === '100' ? 'default' : 'outline'} className="px-2 text-xs" onClick={() => setPreset('100')}>
                  100 × 100 px
                </Button>
                <Button variant={preset === '500' ? 'default' : 'outline'} className="px-2 text-xs" onClick={() => setPreset('500')}>
                  500 × 500 px
                </Button>
                <Button variant={preset === 'custom' ? 'default' : 'outline'} className="px-2 text-xs" onClick={() => setPreset('custom')}>
                  Свой размер
                </Button>
              </div>
              {preset === 'custom' && (
                <Input
                  type="number"
                  inputMode="numeric"
                  min={MIN_SIZE}
                  max={MAX_SIZE}
                  step={10}
                  placeholder={`от ${MIN_SIZE} до ${MAX_SIZE}`}
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                />
              )}
            </div>
          )}

          <p className="break-all text-xs text-muted-foreground">Файл: {fileNameFor(name, format, size)}</p>
          <Button
            disabled={!canPrint || busy}
            onClick={() => {
              setBusy(true)
              void downloadQr(link, name, format, size).finally(() => setBusy(false))
            }}
          >
            {busy ? 'Готовлю файл…' : 'Скачать файл'}
          </Button>
        </>
      )}
    </div>
  )
}

function DetailsPanel({ row, link }: { row: QrRow; link: string | null }) {
  return (
    <div className="space-y-3 border-t pt-3">
      {link && (
        <>
          <QrImage text={link} className="mx-auto w-full max-w-[260px] rounded-md border bg-white" />
          <p className="break-all text-center text-xs text-muted-foreground">{link}</p>
        </>
      )}
      <ScanChart qrId={row._id} />
    </div>
  )
}

function ScanChart({ qrId }: { qrId: string }) {
  const stats = useQuery(backend.qrStats, {
    qrId,
    days: 30,
    tzOffsetMinutes: -new Date().getTimezoneOffset(),
  })
  if (stats === undefined) return <Skeleton className="h-24 w-full" />

  const max = Math.max(1, ...stats.perDay.map((d) => d.count))
  const last30 = stats.perDay.reduce((sum, d) => sum + d.count, 0)
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Сканирования за 30 дней: {last30} · всего: {stats.total}
      </p>
      <div className="flex h-20 items-end gap-px" aria-hidden>
        {stats.perDay.map((d) => (
          <div
            key={d.dayStart}
            title={`${formatDate(d.dayStart)}: ${d.count}`}
            className="flex-1 rounded-sm bg-primary/70"
            style={{ height: `${Math.max(d.count > 0 ? 8 : 2, (d.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{formatDate(stats.perDay[0].dayStart)}</span>
        <span>{formatDate(stats.perDay[stats.perDay.length - 1].dayStart)}</span>
      </div>
    </div>
  )
}

function EditPanel({ row, onDone }: { row: QrRow; onDone: () => void }) {
  const update = useMutation(backend.qrUpdate)
  const [mode, setMode] = useState<'keep' | 'page' | 'url'>('keep')
  const [page, setPage] = useState<{ id: string; name: string } | null>(null)
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState(row.label ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await update({
        qrId: row._id,
        label,
        ...(mode === 'page' && page ? { pageId: page.id } : {}),
        ...(mode === 'url' && url.trim() ? { targetUrl: url } : {}),
      })
      onDone()
    } catch {
      setError('Не удалось сохранить. Ссылка должна начинаться с http:// или https://')
      setBusy(false)
    }
  }

  const ready = mode === 'keep' || (mode === 'page' && page !== null) || (mode === 'url' && url.trim().length > 0)

  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        Куда вести код можно менять в любой момент: картинка и напечатанный код остаются прежними, а смена
        ссылки попадёт во вкладку «История».
      </p>
      <Input placeholder="Название" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />

      <div className="grid grid-cols-3 gap-2">
        <Button variant={mode === 'keep' ? 'default' : 'outline'} className="px-2 text-xs" onClick={() => setMode('keep')}>
          Не менять
        </Button>
        <Button variant={mode === 'page' ? 'default' : 'outline'} className="px-2 text-xs" onClick={() => setMode('page')}>
          Страница
        </Button>
        <Button variant={mode === 'url' ? 'default' : 'outline'} className="px-2 text-xs" onClick={() => setMode('url')}>
          Ссылка
        </Button>
      </div>

      {mode === 'page' && <PagePicker picked={page} onPick={setPage} />}
      {mode === 'url' && (
        <Input inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
      )}

      <div className="flex gap-2">
        <Button disabled={busy || !ready} onClick={() => void save()}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Отмена
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
