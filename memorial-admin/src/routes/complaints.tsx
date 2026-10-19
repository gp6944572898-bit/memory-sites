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
  COMPLAINT_REASON_LABEL,
  COMPLAINT_RESOLUTION_LABEL,
  type ComplaintResolution,
  type ComplaintRow,
  type ComplaintTab,
  type Me,
} from '@/lib/backend'

export const Route = createFileRoute('/complaints')({ component: ComplaintsRoute })

const TABS: { key: ComplaintTab; label: string }[] = [
  { key: 'open', label: 'Новые' },
  { key: 'resolved', label: 'Решённые' },
  { key: 'all', label: 'Все' },
]

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

function ComplaintsRoute() {
  return (
    <AdminGate>
      {(me) => (
        <AdminShell me={me} title="Жалобы">
          <ComplaintList me={me} />
        </AdminShell>
      )}
    </AdminGate>
  )
}

function ComplaintList({ me }: { me: Me }) {
  const [tab, setTab] = useState<ComplaintTab>('open')
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim(), 300)

  const result = useQuery(backend.complaints, { tab, ...(query ? { search: query } : {}) })
  const canDelete = me.capabilities.includes('guestbook.delete')

  return (
    <div className="space-y-3">
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:px-0">
        {TABS.map((t) => (
          <Button
            key={t.key}
            variant={t.key === tab ? 'default' : 'outline'}
            className="shrink-0"
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <Input
        type="search"
        placeholder="Поиск по странице, тексту сообщения или комментарию"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {result === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : result.rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {tab === 'open' && !query ? 'Новых жалоб нет' : 'Ничего не найдено'}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {tab === 'open' ? 'Ждут решения' : 'Найдено'}: {result.rows.length}
            {result.truncated && ' (показаны первые 200)'}
          </p>
          <div className="space-y-3">
            {result.rows.map((row) => (
              <ComplaintCard key={row._id} row={row} canDelete={canDelete} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

type Confirm = ComplaintResolution | null

const CONFIRM_TEXT: Record<ComplaintResolution, string> = {
  hidden: 'Скрыть сообщение? Оно пропадёт со страницы, но останется у нас на 90 дней (до решения по жалобе — дольше).',
  deleted: 'Удалить сообщение навсегда? Восстановить его будет нельзя.',
  blocked: 'Заблокировать страницу? Она пропадёт с сайта, запись и взносы закроются. Блокировку можно снять.',
  warned: 'Отметить предупреждение? Владельцу оно пока не отправляется: отдельного канала уведомлений ещё нет, это только запись в журнале.',
  dismissed: 'Отклонить жалобу как необоснованную? Ничего не будет скрыто или заблокировано.',
}

const CONFIRM_BUTTON: Record<ComplaintResolution, string> = {
  hidden: 'Да, скрыть',
  deleted: 'Да, удалить',
  blocked: 'Да, заблокировать',
  warned: 'Да, отметить',
  dismissed: 'Да, отклонить',
}

function ComplaintCard({ row, canDelete }: { row: ComplaintRow; canDelete: boolean }) {
  const resolve = useMutation(backend.resolveComplaint)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOpen = row.status === 'open'
  const isMessage = row.targetType === 'message'
  const messageGone = isMessage && row.messageText === null
  const messageAlreadyHidden = row.messageStatus === 'hidden'
  const pageAlreadyBlocked = row.pageStatus === 'blocked'

  async function run(resolution: ComplaintResolution) {
    setBusy(true)
    setError(null)
    try {
      await resolve({
        complaintId: row._id,
        resolution,
        // the hide/delete log keeps the same reason the reporter gave, where it fits
        ...(row.reason !== 'fake_info' ? { reason: row.reason } : { reason: 'other' as const }),
      })
      setConfirm(null)
    } catch {
      setError('Не удалось выполнить действие. Обновите список и повторите.')
    } finally {
      setBusy(false)
    }
  }

  // Which buttons make sense for this complaint right now.
  const actions: { resolution: ComplaintResolution; label: string; danger?: boolean }[] = []
  if (isMessage) {
    if (!messageGone && !messageAlreadyHidden) actions.push({ resolution: 'hidden', label: 'Скрыть сообщение' })
    if (!messageGone && canDelete) actions.push({ resolution: 'deleted', label: 'Удалить', danger: true })
  } else if (!pageAlreadyBlocked) {
    actions.push({ resolution: 'blocked', label: 'Заблокировать страницу', danger: true })
  }
  actions.push({ resolution: 'warned', label: 'Предупредить' })
  actions.push({ resolution: 'dismissed', label: 'Отклонить' })

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isOpen ? 'default' : 'secondary'}>{isOpen ? 'Новая' : 'Решена'}</Badge>
          <Badge variant="outline">{isMessage ? 'Сообщение' : 'Страница'}</Badge>
          <Badge variant="outline">{COMPLAINT_REASON_LABEL[row.reason]}</Badge>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">Страница: {row.pageName}</p>
          {isMessage && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              {messageGone ? (
                <p className="text-muted-foreground">Сообщение уже удалено</p>
              ) : (
                <>
                  <p className="font-medium">{row.messageAuthor}</p>
                  <p className="whitespace-pre-wrap break-words">{row.messageText}</p>
                  {messageAlreadyHidden && (
                    <p className="mt-1 text-xs text-muted-foreground">Сообщение уже скрыто</p>
                  )}
                </>
              )}
            </div>
          )}
          {!isMessage && pageAlreadyBlocked && (
            <p className="text-xs text-muted-foreground">Страница уже заблокирована</p>
          )}
        </div>

        {(row.details || row.contact) && (
          <div className="space-y-0.5 text-xs">
            {row.details && (
              <p className="whitespace-pre-wrap break-words">
                <span className="font-medium">Комментарий:</span> {row.details}
              </p>
            )}
            {row.contact && (
              <p className="break-all">
                <span className="font-medium">Контакт:</span> {row.contact}
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Подана {formatDateTime(row.createdAt)}
          {!isOpen && row.resolution && ` · ${COMPLAINT_RESOLUTION_LABEL[row.resolution]}`}
        </p>

        {isOpen && confirm === null && (
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button
                key={a.resolution}
                variant="outline"
                className={a.danger ? 'text-destructive' : ''}
                onClick={() => setConfirm(a.resolution)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}

        {isOpen && confirm !== null && (
          <div className="space-y-2 rounded-md border border-destructive/40 p-3">
            <p className="text-xs">{CONFIRM_TEXT[confirm]}</p>
            <div className="flex gap-2">
              <Button
                variant={confirm === 'dismissed' || confirm === 'warned' ? 'default' : 'destructive'}
                disabled={busy}
                onClick={() => void run(confirm)}
              >
                {busy ? 'Выполняю…' : CONFIRM_BUTTON[confirm]}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>
                Отмена
              </Button>
            </div>
          </div>
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
