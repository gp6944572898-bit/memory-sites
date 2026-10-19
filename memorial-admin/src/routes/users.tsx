import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'

import { AdminGate, AdminShell } from '@/components/admin/admin-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { backend, PAGE_STATUS_LABEL, ROLE_LABEL, type Me, type PageStatus, type UserRow } from '@/lib/backend'

export const Route = createFileRoute('/users')({ component: UsersRoute })

const formatDate = (ms: number) => new Date(ms).toLocaleDateString('ru-RU')

const STATUS_VARIANT: Record<PageStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  pending_payment: 'secondary',
  reduced: 'outline',
  blocked: 'destructive',
}

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function UsersRoute() {
  return (
    <AdminGate>
      {(me) => (
        <AdminShell me={me} title="Пользователи">
          {me.capabilities.includes('users.manage') ? (
            <UserList me={me} />
          ) : (
            <p className="text-sm text-muted-foreground">Раздел доступен только главному админу.</p>
          )}
        </AdminShell>
      )}
    </AdminGate>
  )
}

function UserList({ me }: { me: Me }) {
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim(), 300)
  const result = useQuery(backend.users, query ? { search: query } : {})

  return (
    <div className="space-y-4">
      <Input
        type="search"
        placeholder="Поиск по почте или имени"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        Здесь только зарегистрированные пользователи. Анонимные посетители сайта не показываются.
      </p>

      {result === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : result.rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Ничего не найдено</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Найдено: {result.rows.length}
            {result.truncated && ' (показаны первые 200 — уточните поиск)'}
          </p>
          <div className="space-y-3">
            {result.rows.map((user) => (
              <UserCard key={user._id} user={user} isSelf={user._id === me.userId} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function UserCard({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{user.name ?? user.email ?? 'Без имени'}</p>
            {user.name && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {isSelf && <Badge variant="outline">Это вы</Badge>}
            {user.adminRole && <Badge variant="secondary">{ROLE_LABEL[user.adminRole]}</Badge>}
            {user.blocked && <Badge variant="destructive">Заблокирован</Badge>}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Зарегистрирован {formatDate(user.createdAt)} · страниц: {user.pagesCount}
        </p>

        <Button variant="outline" onClick={() => setOpen((o) => !o)}>
          {open ? 'Скрыть' : 'Открыть профиль'}
        </Button>

        {open && <UserProfilePanel user={user} isSelf={isSelf} />}
      </CardContent>
    </Card>
  )
}

function UserProfilePanel({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const profile = useQuery(backend.userProfile, { userId: user._id })
  const setBlocked = useMutation(backend.setUserBlocked)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(blocked: boolean) {
    setBusy(true)
    setError(null)
    try {
      await setBlocked({
        userId: user._id,
        blocked,
        ...(blocked && reason.trim() ? { reason } : {}),
      })
      setAsking(false)
      setReason('')
    } catch {
      setError('Не удалось выполнить действие. Проверьте права и повторите.')
    } finally {
      setBusy(false)
    }
  }

  const canBlock = !isSelf && user.adminRole !== 'main_admin'

  return (
    <div className="space-y-3 border-t pt-3 text-sm">
      {profile === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : profile === null ? (
        <p className="text-muted-foreground">Пользователь не найден</p>
      ) : (
        <>
          {profile.user.blocked && (
            <p className="text-xs text-destructive">
              Заблокирован{profile.blockReason ? `: ${profile.blockReason}` : ''}
            </p>
          )}

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Страницы ({profile.pages.length})</p>
            {profile.pages.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Пока нет. Здесь видны страницы, созданные после включения учёта владельцев.
              </p>
            ) : (
              profile.pages.map((page) => (
                <div key={page._id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate">{page.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(page.createdAt)} · код {page.slug}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[page.status]} className="shrink-0">
                    {PAGE_STATUS_LABEL[page.status]}
                  </Badge>
                </div>
              ))
            )}
          </div>

          {!canBlock ? (
            <p className="text-xs text-muted-foreground">
              {isSelf
                ? 'Себя заблокировать нельзя.'
                : 'Главного админа нельзя заблокировать: сначала снимите роль в разделе «Админы».'}
            </p>
          ) : profile.user.blocked ? (
            <Button variant="outline" disabled={busy} onClick={() => void run(false)}>
              {busy ? 'Снимаю…' : 'Разблокировать'}
            </Button>
          ) : asking ? (
            <div className="space-y-2">
              <Input
                placeholder="Причина (необязательно)"
                value={reason}
                maxLength={200}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Пользователь не сможет создавать страницы. Если он админ, доступ к админке закроется. Блокировку
                можно снять.
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" disabled={busy} onClick={() => void run(true)}>
                  {busy ? 'Блокирую…' : 'Да, заблокировать'}
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setAsking(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" className="text-destructive" onClick={() => setAsking(true)}>
              Заблокировать
            </Button>
          )}

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  )
}
