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
  HIDE_REASON_LABEL,
  MESSAGE_STATUS_LABEL,
  type GuestbookRow,
  type GuestbookTab,
  type HideReason,
  type Me,
  type MessageStatus,
} from '@/lib/backend'

export const Route = createFileRoute('/guestbook')({ component: GuestbookRoute })

const TABS: { key: GuestbookTab; label: string }[] = [
  { key: 'queue', label: 'Требуют решения' },
  { key: 'hidden', label: 'Скрытые' },
  { key: 'all', label: 'Все' },
]

const STATUS_VARIANT: Record<MessageStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending_platform: 'default',
  pending_owner: 'secondary',
  published: 'outline',
  hidden: 'destructive',
}

const REASONS = Object.keys(HIDE_REASON_LABEL) as HideReason[]

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

function GuestbookRoute() {
  return (
    <AdminGate>
      {(me) => (
        <AdminShell me={me} title="Книга памяти">
          <MessageList me={me} />
        </AdminShell>
      )}
    </AdminGate>
  )
}

function MessageList({ me }: { me: Me }) {
  const [tab, setTab] = useState<GuestbookTab>('queue')
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim(), 300)

  const result = useQuery(backend.guestbook, {
    tab,
    ...(query ? { search: query } : {}),
  })
  const canDelete = me.capabilities.includes('guestbook.delete')

  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
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
        placeholder="Поиск по тексту или имени автора"
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
          {tab === 'queue' && !query ? 'Очередь пуста — всё проверено' : 'Ничего не найдено'}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {tab === 'queue' ? 'Ждут проверки' : 'Найдено'}: {result.rows.length}
            {result.truncated && ' (показаны первые 200)'}
          </p>
          <div className="space-y-3">
            {result.rows.map((row) => (
              <MessageCard key={row._id} row={row} canDelete={canDelete} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

type Mode = 'none' | 'hide' | 'delete'

function MessageCard({ row, canDelete }: { row: GuestbookRow; canDelete: boolean }) {
  const approve = useMutation(backend.approveMessage)
  const hide = useMutation(backend.hideMessage)
  const restore = useMutation(backend.restoreMessage)
  const remove = useMutation(backend.removeMessage)

  const [mode, setMode] = useState<Mode>('none')
  const [deleteReason, setDeleteReason] = useState<HideReason | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isPending = row.status === 'pending_platform' || row.status === 'pending_owner'
  const canRestore = row.status === 'hidden' && row.hiddenBy === 'platform'

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setMode('none')
      setDeleteReason(null)
    } catch {
      setError('Не удалось выполнить действие. Обновите список и повторите.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_VARIANT[row.status]}>{MESSAGE_STATUS_LABEL[row.status]}</Badge>
          {row.heldReason && (
            <Badge variant="outline">
              Удержано: {row.heldReason === 'link' ? 'ссылка' : 'телефон'}
            </Badge>
          )}
          {row.overdue && <Badge variant="destructive">Владелец не отвечает 14+ дней</Badge>}
        </div>

        <div>
          <p className="text-sm font-medium">{row.authorName}</p>
          <p className="text-xs text-muted-foreground">
            Страница: {row.pageName} · {formatDateTime(row.createdAt)}
          </p>
        </div>

        <p className="whitespace-pre-wrap break-words text-sm">{row.text}</p>

        {row.status === 'hidden' && (
          <p className="text-xs text-muted-foreground">
            Скрыто {row.hiddenBy === 'owner' ? 'владельцем' : 'платформой'}
            {row.hiddenReason &&
              ` · ${HIDE_REASON_LABEL[row.hiddenReason as HideReason] ?? row.hiddenReason}`}
            {row.hiddenAt && ` · ${formatDateTime(row.hiddenAt)}`}
          </p>
        )}

        {mode === 'none' && (
          <div className="flex flex-wrap gap-2">
            {isPending && (
              <Button disabled={busy} onClick={() => void run(() => approve({ messageId: row._id }))}>
                Одобрить
              </Button>
            )}
            {canRestore && (
              <Button variant="outline" disabled={busy} onClick={() => void run(() => restore({ messageId: row._id }))}>
                Вернуть
              </Button>
            )}
            {row.status !== 'hidden' && (
              <Button variant="outline" onClick={() => setMode('hide')}>
                Скрыть
              </Button>
            )}
            {canDelete && (
              <Button variant="outline" className="text-destructive" onClick={() => setMode('delete')}>
                Удалить
              </Button>
            )}
          </div>
        )}

        {mode === 'hide' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Причина скрытия:</p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((reason) => (
                <Button
                  key={reason}
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(() => hide({ messageId: row._id, reason }))}
                >
                  {HIDE_REASON_LABEL[reason]}
                </Button>
              ))}
              <Button variant="ghost" onClick={() => setMode('none')}>
                Отмена
              </Button>
            </div>
          </div>
        )}

        {mode === 'delete' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Удаление навсегда. Причина (в журнале останется только она, без текста):
            </p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map((reason) => (
                <Button
                  key={reason}
                  variant={deleteReason === reason ? 'default' : 'outline'}
                  onClick={() => setDeleteReason(reason)}
                >
                  {HIDE_REASON_LABEL[reason]}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={busy || !deleteReason}
                onClick={() =>
                  deleteReason && void run(() => remove({ messageId: row._id, reason: deleteReason }))
                }
              >
                {busy ? 'Удаляю…' : 'Удалить навсегда'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setMode('none')
                  setDeleteReason(null)
                }}
              >
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
