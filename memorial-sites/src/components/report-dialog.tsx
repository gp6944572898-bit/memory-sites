import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Check, Flag } from 'lucide-react'

import { api } from '@/../convex/_generated/api'
import type { Id } from '@/../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getDeviceKey } from '@/lib/device-key'

type Reason = 'spam' | 'insult' | 'personal_data' | 'illegal' | 'fake_info' | 'other'

const REASONS: { id: Reason; label: string }[] = [
  { id: 'spam', label: 'Спам или реклама' },
  { id: 'insult', label: 'Оскорбление' },
  { id: 'personal_data', label: 'Личные данные' },
  { id: 'illegal', label: 'Незаконное содержание' },
  { id: 'fake_info', label: 'Недостоверная информация' },
  { id: 'other', label: 'Другое' },
]

export type ReportTarget =
  | { type: 'page'; pageId: Id<'pages'> }
  | { type: 'message'; messageId: Id<'guestbookMessages'> }

// A barely-visible flag icon plus the dialog it opens. Works for a whole page
// or a single guestbook message; no sign-in needed. `label` is for
// screen readers only — the icon carries no visible text, by design.
export function ReportButton({
  target,
  label,
}: {
  target: ReportTarget
  label: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className="shrink-0 rounded p-1 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
      >
        <Flag className="h-3.5 w-3.5" />
      </button>
      {open && <ReportDialog target={target} onClose={() => setOpen(false)} />}
    </>
  )
}

function ReportDialog({
  target,
  onClose,
}: {
  target: ReportTarget
  onClose: () => void
}) {
  const submit = useMutation(api.complaints.submit)
  const [reason, setReason] = useState<Reason | null>(null)
  const [details, setDetails] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit() {
    if (!reason) return
    setBusy(true)
    setError(null)
    try {
      await submit({
        targetType: target.type,
        ...(target.type === 'page'
          ? { pageId: target.pageId }
          : { messageId: target.messageId }),
        reason,
        ...(details.trim() ? { details } : {}),
        ...(contact.trim() ? { contact } : {}),
        deviceKey: getDeviceKey(),
      })
      setSent(true)
    } catch (err) {
      const tooFast = err instanceof Error && err.message.includes('Слишком много')
      setError(
        tooFast
          ? 'Вы отправляете слишком часто. Попробуйте чуть позже.'
          : 'Не удалось отправить жалобу. Попробуйте ещё раз.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {sent ? 'Жалоба отправлена' : target.type === 'page' ? 'Пожаловаться на страницу' : 'Пожаловаться на сообщение'}
          </DialogTitle>
          <DialogDescription>
            {sent
              ? 'Спасибо. Мы рассмотрим её в ближайшее время.'
              : 'Выберите причину. Жалоба анонимна, контакты указывать необязательно.'}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <Button onClick={onClose}>Закрыть</Button>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              {REASONS.map((r) => {
                const selected = reason === r.id
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReason(r.id)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                      selected ? 'border-primary bg-primary/5' : 'border-border bg-card'
                    }`}
                  >
                    <span>{r.label}</span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-muted-foreground/40'
                      }`}
                    >
                      {selected && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                )
              })}
            </div>

            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Комментарий (необязательно)"
              rows={3}
              maxLength={1000}
            />
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Как с вами связаться (необязательно)"
              maxLength={200}
            />

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button className="flex-1" disabled={busy || !reason} onClick={() => void handleSubmit()}>
                {busy ? 'Отправляю…' : 'Отправить'}
              </Button>
              <Button variant="outline" onClick={onClose}>
                Отмена
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
