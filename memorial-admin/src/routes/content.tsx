import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'

import { AdminGate, AdminShell } from '@/components/admin/admin-shell'
import { ImageUploadField } from '@/components/admin/image-upload-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { backend, type EpitaphTemplate, type Sticker, type ThemeSetting } from '@/lib/backend'

export const Route = createFileRoute('/content')({ component: ContentRoute })

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`

function ContentRoute() {
  return (
    <AdminGate>
      {(me) => (
        <AdminShell me={me} title="Стикеры и контент">
          {me.capabilities.includes('platform.settings') ? (
            <ContentPage />
          ) : (
            <p className="text-sm text-muted-foreground">Раздел доступен только главному админу.</p>
          )}
        </AdminShell>
      )}
    </AdminGate>
  )
}

function ContentPage() {
  const [tab, setTab] = useState<'stickers' | 'epitaphs' | 'themes'>('stickers')
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2">
        <Button variant={tab === 'stickers' ? 'default' : 'outline'} className="px-2 text-xs" onClick={() => setTab('stickers')}>
          Стикеры
        </Button>
        <Button variant={tab === 'epitaphs' ? 'default' : 'outline'} className="px-2 text-xs" onClick={() => setTab('epitaphs')}>
          Эпитафии
        </Button>
        <Button variant={tab === 'themes' ? 'default' : 'outline'} className="px-2 text-xs" onClick={() => setTab('themes')}>
          Темы
        </Button>
      </div>
      {tab === 'stickers' && <StickersTab />}
      {tab === 'epitaphs' && <EpitaphsTab />}
      {tab === 'themes' && <ThemesTab />}
    </div>
  )
}

// ---- stickers ---------------------------------------------------------

function StickersTab() {
  const stickers = useQuery(backend.stickers, {})
  return (
    <div className="space-y-4">
      <CreateStickerCard />
      {stickers === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : stickers.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Стикеров пока нет — добавьте первый выше</p>
      ) : (
        stickers.map((sticker, i) => (
          <StickerCard key={sticker._id} sticker={sticker} isFirst={i === 0} isLast={i === stickers.length - 1} />
        ))
      )}
    </div>
  )
}

function CreateStickerCard() {
  const create = useMutation(backend.createSticker)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = name.trim() && category.trim() && imageUrl && Number(price) >= 0

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await create({ name, category, imageUrl, priceRub: Number(price) })
      setName('')
      setCategory('')
      setPrice('')
      setImageUrl('')
    } catch {
      setError('Не удалось создать стикер. Проверьте поля.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Новый стикер</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ImageUploadField value={imageUrl} onChange={setImageUrl} />
        <Input placeholder="Название" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Категория, например «Цветы»" value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} />
        <Input
          type="number"
          inputMode="numeric"
          placeholder="Цена, ₽"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Button disabled={busy || !ready} onClick={() => void submit()}>
          {busy ? 'Добавляю…' : 'Добавить стикер'}
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

function StickerCard({ sticker, isFirst, isLast }: { sticker: Sticker; isFirst: boolean; isLast: boolean }) {
  const update = useMutation(backend.updateSticker)
  const reorder = useMutation(backend.reorderSticker)
  const remove = useMutation(backend.deleteSticker)
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setEditing(false)
      setConfirmingDelete(false)
    } catch {
      setError('Не удалось выполнить действие')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <img src={sticker.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-md border object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium">{sticker.name}</p>
              {!sticker.active && <Badge variant="secondary">Скрыт</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {sticker.category} · {rub(sticker.priceRub)}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <Button variant="ghost" size="icon" disabled={isFirst} onClick={() => void run(() => reorder({ stickerId: sticker._id, direction: 'up' }))}>
              <ArrowUp className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" disabled={isLast} onClick={() => void run(() => reorder({ stickerId: sticker._id, direction: 'down' }))}>
              <ArrowDown className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Скрыть' : 'Изменить'}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => update({ stickerId: sticker._id, active: !sticker.active }))}
          >
            {sticker.active ? 'Скрыть с сайта' : 'Показать на сайте'}
          </Button>
          <Button variant="outline" className="text-destructive" onClick={() => setConfirmingDelete(true)}>
            Удалить
          </Button>
        </div>

        {confirmingDelete && (
          <div className="space-y-2 rounded-md border border-destructive/40 p-3">
            <p className="text-xs">Удалить стикер «{sticker.name}» навсегда?</p>
            <div className="flex gap-2">
              <Button variant="destructive" disabled={busy} onClick={() => void run(() => remove({ stickerId: sticker._id }))}>
                Да, удалить
              </Button>
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                Отмена
              </Button>
            </div>
          </div>
        )}

        {editing && <EditStickerForm sticker={sticker} onSaved={() => setEditing(false)} />}
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function EditStickerForm({ sticker, onSaved }: { sticker: Sticker; onSaved: () => void }) {
  const update = useMutation(backend.updateSticker)
  const [name, setName] = useState(sticker.name)
  const [category, setCategory] = useState(sticker.category)
  const [price, setPrice] = useState(String(sticker.priceRub))
  const [imageUrl, setImageUrl] = useState(sticker.imageUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await update({ stickerId: sticker._id, name, category, priceRub: Number(price), imageUrl })
      onSaved()
    } catch {
      setError('Не удалось сохранить')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <ImageUploadField value={imageUrl} onChange={setImageUrl} />
      <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      <Input value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} />
      <Input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
      <Button disabled={busy} onClick={() => void save()}>
        {busy ? 'Сохраняю…' : 'Сохранить'}
      </Button>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// ---- epitaphs -----------------------------------------------------------

function EpitaphsTab() {
  const templates = useQuery(backend.epitaphTemplates, {})
  return (
    <div className="space-y-4">
      <CreateEpitaphCard />
      {templates === undefined ? (
        <Skeleton className="h-16 w-full" />
      ) : templates.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Пока показываются стандартные фразы — добавьте свои, чтобы заменить их
        </p>
      ) : (
        templates.map((t, i) => (
          <EpitaphCard key={t._id} template={t} isFirst={i === 0} isLast={i === templates.length - 1} />
        ))
      )}
    </div>
  )
}

function CreateEpitaphCard() {
  const create = useMutation(backend.createEpitaphTemplate)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await create({ text })
      setText('')
    } catch {
      setError('Не удалось добавить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <Input placeholder="Новая эпитафия" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} />
        <Button disabled={busy || !text.trim()} onClick={() => void submit()}>
          {busy ? 'Добавляю…' : 'Добавить'}
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

function EpitaphCard({ template, isFirst, isLast }: { template: EpitaphTemplate; isFirst: boolean; isLast: boolean }) {
  const update = useMutation(backend.updateEpitaphTemplate)
  const reorder = useMutation(backend.reorderEpitaphTemplate)
  const remove = useMutation(backend.deleteEpitaphTemplate)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setEditingText(null)
    } catch {
      setError('Не удалось выполнить действие')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {editingText === null ? (
          <div className="flex items-start justify-between gap-3">
            <p className={template.active ? '' : 'text-muted-foreground line-through'}>{template.text}</p>
            <div className="flex shrink-0 flex-col gap-1">
              <Button variant="ghost" size="icon" disabled={isFirst} onClick={() => void run(() => reorder({ templateId: template._id, direction: 'up' }))}>
                <ArrowUp className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled={isLast} onClick={() => void run(() => reorder({ templateId: template._id, direction: 'down' }))}>
                <ArrowDown className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <Input value={editingText} maxLength={200} onChange={(e) => setEditingText(e.target.value)} autoFocus />
        )}

        <div className="flex flex-wrap gap-2">
          {editingText === null ? (
            <Button variant="outline" onClick={() => setEditingText(template.text)}>
              Изменить текст
            </Button>
          ) : (
            <>
              <Button disabled={busy || !editingText.trim()} onClick={() => void run(() => update({ templateId: template._id, text: editingText }))}>
                Сохранить
              </Button>
              <Button variant="ghost" onClick={() => setEditingText(null)}>
                Отмена
              </Button>
            </>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void run(() => update({ templateId: template._id, active: !template.active }))}
          >
            {template.active ? 'Скрыть' : 'Показать'}
          </Button>
          <Button variant="outline" className="text-destructive" disabled={busy} onClick={() => void run(() => remove({ templateId: template._id }))}>
            Удалить
          </Button>
        </div>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ---- themes ---------------------------------------------------------------

const THEME_LABEL: Record<'light' | 'dark', string> = { light: 'Светлая', dark: 'Тёмная' }

function ThemesTab() {
  const settings = useQuery(backend.themeSettings, {})
  const setEnabled = useMutation(backend.setThemeEnabled)
  const [error, setError] = useState<string | null>(null)

  async function toggle(theme: ThemeSetting) {
    setError(null)
    try {
      await setEnabled({ theme: theme.id, enabled: !theme.enabled })
    } catch {
      setError('Должна остаться включена хотя бы одна тема')
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Отключённая тема пропадает из выбора при создании страницы. Хотя бы одна тема должна оставаться включённой.
      </p>
      {settings === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        settings.map((theme) => (
          <Card key={theme.id}>
            <CardContent className="flex items-center justify-between p-4">
              <p className="font-medium">{THEME_LABEL[theme.id]}</p>
              <Button variant={theme.enabled ? 'outline' : 'default'} onClick={() => void toggle(theme)}>
                {theme.enabled ? 'Включена' : 'Выключена'}
              </Button>
            </CardContent>
          </Card>
        ))
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
