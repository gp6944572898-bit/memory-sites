import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'

import { api } from '@/../convex/_generated/api'
import type { Id } from '@/../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RuDateInput } from '@/components/ru-date-input'
import { PhotoUploader } from '@/components/photo-uploader'
import { PhotoAlbumUploader } from '@/components/photo-album-uploader'
import { VideoUploader } from '@/components/video-uploader'
import { BurialMapPicker } from '@/components/burial-map-picker'

export const Route = createFileRoute('/owner/$token')({
  head: () => ({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] }),
  component: OwnerPage,
})

type Tab = 'content' | 'guestbook' | 'settings'

function OwnerPage() {
  const { token } = Route.useParams()
  const page = useQuery(api.owner.get, { token })
  const [tab, setTab] = useState<Tab>('content')

  if (page === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      </main>
    )
  }

  if (page === null) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">Ссылка недействительна</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Проверьте, что вы скопировали её целиком. Если ссылка утеряна, восстановить доступ
          пока нельзя — напишите в поддержку.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold text-foreground">{page.fullName}</h1>
        <Link to="/m/$slug" params={{ slug: page.slug }} className="text-sm text-muted-foreground underline">
          Открыть страницу
        </Link>
        {page.status === 'blocked' && (
          <p className="text-sm text-destructive">
            Страница заблокирована администрацией. Редактирование и книга памяти недоступны.
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Button variant={tab === 'content' ? 'default' : 'outline'} className="px-2 text-sm" onClick={() => setTab('content')}>
          Содержимое
        </Button>
        <Button variant={tab === 'guestbook' ? 'default' : 'outline'} className="px-2 text-sm" onClick={() => setTab('guestbook')}>
          Книга памяти
        </Button>
        <Button variant={tab === 'settings' ? 'default' : 'outline'} className="px-2 text-sm" onClick={() => setTab('settings')}>
          Настройки
        </Button>
      </div>

      {tab === 'content' && <ContentTab token={token} page={page} />}
      {tab === 'guestbook' && <GuestbookTab token={token} blocked={page.status === 'blocked'} />}
      {tab === 'settings' && <SettingsTab token={token} page={page} />}
    </main>
  )
}

// ---- content ----------------------------------------------------------

type OwnerPageData = NonNullable<ReturnType<typeof useQuery<typeof api.owner.get>>>

function ContentTab({ token, page }: { token: string; page: OwnerPageData }) {
  const update = useMutation(api.owner.updateContent)
  const [fullName, setFullName] = useState(page.fullName)
  const [birthDate, setBirthDate] = useState(page.birthDate)
  const [deathDate, setDeathDate] = useState(page.deathDate)
  const [epitaph, setEpitaph] = useState(page.epitaph)
  const [bioText, setBioText] = useState(page.bioText)
  const [mainPhotoUrl, setMainPhotoUrl] = useState(page.mainPhotoUrl ?? undefined)
  const [photoAlbumUrls, setPhotoAlbumUrls] = useState(page.photoAlbumUrls)
  const [videoUrl, setVideoUrl] = useState(page.videoUrl ?? undefined)
  const [lat, setLat] = useState(page.burialLat ?? undefined)
  const [lng, setLng] = useState(page.burialLng ?? undefined)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const disabled = page.status === 'blocked'

  async function save() {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await update({
        token,
        fullName,
        birthDate,
        deathDate,
        epitaph,
        bioText,
        mainPhotoUrl,
        photoAlbumUrls,
        videoUrl,
        ...(lat !== undefined ? { burialLat: lat } : {}),
        ...(lng !== undefined ? { burialLng: lng } : {}),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError('Не удалось сохранить изменения')
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset disabled={disabled} className="space-y-5 disabled:opacity-60">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Имя</p>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Дата рождения</p>
          <RuDateInput value={birthDate} onChange={setBirthDate} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">Дата смерти</p>
          <RuDateInput value={deathDate} onChange={setDeathDate} />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Эпитафия</p>
        <Input value={epitaph} onChange={(e) => setEpitaph(e.target.value)} maxLength={300} />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">История жизни</p>
        <Textarea value={bioText} onChange={(e) => setBioText(e.target.value)} rows={6} />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Главное фото</p>
        <PhotoUploader value={mainPhotoUrl} onChange={setMainPhotoUrl} />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Фотоальбом</p>
        <PhotoAlbumUploader urls={photoAlbumUrls} onChange={setPhotoAlbumUrls} />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Видео</p>
        <VideoUploader value={videoUrl} onChange={setVideoUrl} />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground">Место захоронения</p>
        <BurialMapPicker lat={lat} lng={lng} onChange={(a, b) => { setLat(a); setLng(b) }} />
      </div>

      <div className="sticky bottom-4 flex items-center gap-3 rounded-lg border bg-background p-3 shadow-sm">
        <Button disabled={busy} onClick={() => void save()}>
          {busy ? 'Сохраняю…' : 'Сохранить изменения'}
        </Button>
        {saved && <p className="text-sm text-muted-foreground">Сохранено</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </fieldset>
  )
}

// ---- settings ----------------------------------------------------------

function SettingsTab({ token, page }: { token: string; page: OwnerPageData }) {
  const setRequireApproval = useMutation(api.owner.setRequireApproval)
  const setOwnerEmail = useMutation(api.owner.setOwnerEmail)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState(page.ownerEmail ?? '')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailSaved, setEmailSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      await setRequireApproval({ token, requireApproval: !page.requireApproval })
    } catch {
      setError('Не удалось изменить настройку')
    } finally {
      setBusy(false)
    }
  }

  async function saveEmail() {
    setEmailBusy(true)
    setEmailSaved(false)
    try {
      await setOwnerEmail({ token, email })
      setEmailSaved(true)
    } catch {
      setError('Не удалось сохранить почту')
    } finally {
      setEmailBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-foreground">
            Проверять сообщения перед публикацией
          </p>
          <Button variant={page.requireApproval ? 'default' : 'outline'} onClick={() => void toggle()} disabled={busy}>
            {page.requireApproval ? 'Включено' : 'Выключено'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Если включено, новые сообщения в книге памяти появятся на странице только после вашего
          одобрения во вкладке «Книга памяти».
        </p>
      </div>

      <div className="space-y-2 rounded-lg border p-4">
        <p className="text-sm font-medium text-foreground">Почта для себя (необязательно)</p>
        <p className="text-xs text-muted-foreground">
          Хранится при странице на случай, если захотите свериться позже. Автоматической отправки
          письма со ссылкой на управление пока нет — сохраните её сами.
        </p>
        <div className="flex gap-2">
          <Input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button variant="outline" disabled={emailBusy} onClick={() => void saveEmail()}>
            {emailBusy ? 'Сохраняю…' : 'Сохранить'}
          </Button>
        </div>
        {emailSaved && <p className="text-xs text-muted-foreground">Сохранено</p>}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

// ---- guestbook ----------------------------------------------------------

type OwnerMessage = {
  _id: Id<'guestbookMessages'>
  authorName: string
  text: string
  status: 'pending_platform' | 'pending_owner' | 'published' | 'hidden'
  hiddenBy: 'owner' | 'platform' | null
  createdAt: number
}

const STATUS_LABEL: Record<OwnerMessage['status'], string> = {
  pending_platform: 'Ждёт проверки платформой',
  pending_owner: 'Ждёт вашего решения',
  published: 'Опубликовано',
  hidden: 'Скрыто',
}

function GuestbookTab({ token, blocked }: { token: string; blocked: boolean }) {
  const messages = useQuery(api.owner.listMessages, { token })

  if (blocked) {
    return <p className="text-sm text-muted-foreground">Книга памяти недоступна, пока страница заблокирована.</p>
  }
  if (messages === undefined) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>
  }
  if (messages.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Сообщений пока нет</p>
  }

  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <MessageCard key={m._id} message={m} token={token} />
      ))}
    </div>
  )
}

function MessageCard({ message, token }: { message: OwnerMessage; token: string }) {
  const approve = useMutation(api.owner.approveMessage)
  const hide = useMutation(api.owner.hideMessage)
  const restore = useMutation(api.owner.restoreMessage)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch {
      setError('Не удалось выполнить действие')
    } finally {
      setBusy(false)
    }
  }

  const canRestore = message.status === 'hidden' && message.hiddenBy === 'owner'
  const canHide = message.status === 'published' || message.status === 'pending_owner'

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{message.authorName}</p>
        <span className="shrink-0 text-xs text-muted-foreground">{STATUS_LABEL[message.status]}</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{message.text}</p>
      <div className="flex flex-wrap gap-2">
        {message.status === 'pending_owner' && (
          <Button size="sm" disabled={busy} onClick={() => void run(() => approve({ token, messageId: message._id }))}>
            Одобрить
          </Button>
        )}
        {canHide && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => hide({ token, messageId: message._id }))}>
            Скрыть
          </Button>
        )}
        {canRestore && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => restore({ token, messageId: message._id }))}>
            Вернуть
          </Button>
        )}
        {message.hiddenBy === 'platform' && (
          <p className="text-xs text-muted-foreground">Скрыто платформой, вернуть может только модератор</p>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
