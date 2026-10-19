import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'

import { AdminGate, AdminShell } from '@/components/admin/admin-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { backend, ROLE_LABEL, type AdminRole, type AdminRow, type Me } from '@/lib/backend'

export const Route = createFileRoute('/admins')({ component: AdminsRoute })

const ROLES: AdminRole[] = ['moderator', 'main_admin']

const formatDate = (ms: number) => new Date(ms).toLocaleDateString('ru-RU')

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function AdminsRoute() {
  return (
    <AdminGate>
      {(me) => (
        <AdminShell me={me} title="Админы">
          {me.capabilities.includes('admins.manage') ? (
            <AdminsPage me={me} />
          ) : (
            <p className="text-sm text-muted-foreground">Раздел доступен только главному админу.</p>
          )}
        </AdminShell>
      )}
    </AdminGate>
  )
}

function AdminsPage({ me }: { me: Me }) {
  const admins = useQuery(backend.admins, {})

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Роли</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Модератор:</span> книга памяти (одобрять, скрывать,
            удалять сообщения), просмотр страниц и блокировка страницы. Не видит деньги, пользователей и
            настройки.
          </p>
          <p>
            <span className="font-medium text-foreground">Главный админ:</span> всё вышеперечисленное, а также
            пользователи, сборы и платежи, QR-коды, управление админами.
          </p>
        </CardContent>
      </Card>

      <AddAdmin />

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Админов: {admins?.length ?? '…'}
        </p>
        {admins === undefined ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          admins.map((row) => <AdminCard key={row.userId} row={row} isSelf={row.userId === me.userId} />)
        )}
      </div>
    </div>
  )
}

function AdminCard({ row, isSelf }: { row: AdminRow; isSelf: boolean }) {
  const setRole = useMutation(backend.setAdminRole)
  const remove = useMutation(backend.removeAdmin)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setConfirming(false)
    } catch {
      setError('Не удалось выполнить действие. Обновите страницу и повторите.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{row.name ?? row.email ?? 'Без имени'}</p>
            {row.name && <p className="truncate text-xs text-muted-foreground">{row.email}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {isSelf && <Badge variant="outline">Это вы</Badge>}
            {row.blocked && <Badge variant="destructive">Заблокирован</Badge>}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Админ с {formatDate(row.createdAt)}
          {row.grantedByEmail && ` · выдал ${row.grantedByEmail}`}
        </p>

        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((role) => (
            <Button
              key={role}
              variant={row.role === role ? 'default' : 'outline'}
              disabled={busy || isSelf || row.role === role}
              className="px-2 text-xs sm:text-sm"
              onClick={() => void run(() => setRole({ userId: row.userId, role }))}
            >
              {ROLE_LABEL[role]}
            </Button>
          ))}
        </div>

        {isSelf ? (
          <p className="text-xs text-muted-foreground">Свою роль менять и снимать нельзя.</p>
        ) : confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="destructive" disabled={busy} onClick={() => void run(() => remove({ userId: row.userId }))}>
              {busy ? 'Снимаю…' : 'Да, снять роль'}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Отмена
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="text-destructive" onClick={() => setConfirming(true)}>
            Снять роль админа
          </Button>
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

function AddAdmin() {
  const addAdmin = useMutation(backend.addAdmin)
  const [text, setText] = useState('')
  const query = useDebounced(text.trim(), 300)
  const found = useQuery(backend.users, query.length >= 2 ? { search: query } : 'skip')
  const [picked, setPicked] = useState<{ id: string; label: string } | null>(null)
  const [role, setRole] = useState<AdminRole>('moderator')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // Only registered users who are not admins yet can be chosen.
  const candidates = found?.rows.filter((u) => u.adminRole === null && !u.blocked).slice(0, 5)

  async function submit() {
    if (!picked) return
    setBusy(true)
    setError(null)
    setDone(null)
    try {
      await addAdmin({ userId: picked.id, role })
      setDone(`${picked.label} теперь ${ROLE_LABEL[role].toLowerCase()}`)
      setPicked(null)
      setText('')
    } catch {
      setError('Не удалось добавить. Возможно, пользователь уже админ или заблокирован.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Добавить админа</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Выбрать можно только зарегистрированного пользователя. Пусть сначала войдёт на сайт или в админку по
          коду из письма.
        </p>

        {picked ? (
          <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
            <span className="truncate">{picked.label}</span>
            <Button variant="ghost" onClick={() => setPicked(null)}>
              Сменить
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input placeholder="Найти по почте или имени" value={text} onChange={(e) => setText(e.target.value)} />
            {candidates && candidates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Никого не нашлось среди пользователей без роли.
              </p>
            )}
            {candidates?.map((user) => (
              <Button
                key={user._id}
                variant="outline"
                className="w-full justify-start"
                onClick={() => setPicked({ id: user._id, label: user.name ?? user.email ?? 'Пользователь' })}
              >
                <span className="truncate">
                  {user.name ? `${user.name} · ${user.email}` : user.email}
                </span>
              </Button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((r) => (
            <Button
              key={r}
              variant={role === r ? 'default' : 'outline'}
              className="px-2 text-xs sm:text-sm"
              onClick={() => setRole(r)}
            >
              {ROLE_LABEL[r]}
            </Button>
          ))}
        </div>

        <Button disabled={busy || !picked} onClick={() => void submit()}>
          {busy ? 'Добавляю…' : 'Добавить'}
        </Button>

        {done && (
          <p className="text-xs text-muted-foreground" role="status">
            {done}
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
