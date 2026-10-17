import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { Check, Copy } from 'lucide-react'

import { api } from '@/../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Shown once, right after a page is created. The owner link is the ONLY way
// back into managing the page — there is no sign-in — so this screen exists
// specifically to make sure the person sees and can save it before moving on.
export function OwnerLinkScreen({
  slug,
  ownerToken,
}: {
  slug: string
  ownerToken: string
}) {
  const setOwnerEmail = useMutation(api.owner.setOwnerEmail)
  const [copied, setCopied] = useState(false)
  const [email, setEmail] = useState('')
  const [emailSaved, setEmailSaved] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [savingEmail, setSavingEmail] = useState(false)

  const ownerUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/owner/${ownerToken}` : `/owner/${ownerToken}`

  function copyLink() {
    void navigator.clipboard.writeText(ownerUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  async function saveEmail() {
    if (!email.trim()) return
    setSavingEmail(true)
    setEmailError(null)
    try {
      await setOwnerEmail({ token: ownerToken, email })
      setEmailSaved(true)
    } catch {
      setEmailError('Не удалось сохранить. Проверьте адрес почты.')
    } finally {
      setSavingEmail(false)
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Страница создана
        </h1>
        <p className="text-muted-foreground">
          Сохраните эту ссылку — только по ней можно будет вернуться и управлять страницей:
          менять текст и фото, модерировать книгу памяти, настраивать проверку сообщений.
          Входа по паролю нет, и показать эту ссылку ещё раз мы не сможем.
        </p>
      </div>

      <div className="w-full max-w-md space-y-2">
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
          <code className="flex-1 overflow-x-auto whitespace-nowrap text-left text-xs text-foreground">
            {ownerUrl}
          </code>
          <Button type="button" size="icon" variant="outline" onClick={copyLink} aria-label="Скопировать ссылку">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        {copied && <p className="text-xs text-muted-foreground">Ссылка скопирована</p>}
      </div>

      <div className="w-full max-w-md space-y-2 rounded-lg border p-4 text-left">
        <p className="text-sm font-medium text-foreground">
          Хотите на всякий случай оставить почту? (необязательно)
        </p>
        <p className="text-xs text-muted-foreground">
          Мы её сохраним при странице для памяти, но пока не умеем присылать на неё ссылку
          автоматически — отправьте её себе сами, скопировав выше.
        </p>
        {emailSaved ? (
          <p className="text-sm text-foreground">Почта сохранена.</p>
        ) : (
          <div className="flex gap-2">
            <Input
              type="email"
              inputMode="email"
              placeholder="Ваша почта"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="button" variant="outline" disabled={savingEmail || !email.trim()} onClick={() => void saveEmail()}>
              {savingEmail ? 'Сохраняю…' : 'Сохранить'}
            </Button>
          </div>
        )}
        {emailError && <p className="text-xs text-destructive">{emailError}</p>}
      </div>

      <Button asChild size="lg">
        <Link to="/m/$slug" params={{ slug }}>
          Перейти на страницу
        </Link>
      </Button>
    </main>
  )
}
