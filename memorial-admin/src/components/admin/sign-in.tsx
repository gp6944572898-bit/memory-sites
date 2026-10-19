import { useAuthActions } from "@convex-dev/auth/react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// Sign-in by a one-time code sent to the email. Phone and SSO (Sber ID, VK,
// Gosuslugi) will be added later as extra providers next to this one.
export function SignIn() {
  const { signIn } = useAuthActions()
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const normalizedEmail = email.trim().toLowerCase()

  async function sendCode(event: React.FormEvent) {
    event.preventDefault()
    if (!normalizedEmail) return
    setBusy(true)
    setError(null)
    try {
      await signIn("resend-otp", { email: normalizedEmail })
      setStep("code")
    } catch {
      setError("Не удалось отправить код. Проверьте почту и попробуйте ещё раз.")
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    try {
      await signIn("resend-otp", { email: normalizedEmail, code: code.trim() })
    } catch {
      setError("Неверный или просроченный код. Запросите новый.")
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Админка</h1>
          <p className="text-sm text-muted-foreground">
            Место памяти — вход для администраторов
          </p>
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-3">
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Почта"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={busy || !normalizedEmail}>
              {busy ? "Отправляю…" : "Получить код"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-3">
            <p className="text-center text-sm text-muted-foreground">
              Код отправлен на {normalizedEmail}
            </p>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Код из письма"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={busy || code.trim().length < 6}>
              {busy ? "Проверяю…" : "Войти"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep("email")
                setCode("")
                setError(null)
              }}
            >
              Изменить почту
            </Button>
          </form>
        )}

        {error && (
          <p className="text-center text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
