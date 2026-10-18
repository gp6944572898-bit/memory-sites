import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'

import { api } from '@/../convex/_generated/api'
import { Button } from '@/components/ui/button'

// Where a scanned QR code lands: <site address>/r/<code>. The code is resolved
// by the backend (and the scan counted), then the visitor goes on to the
// memorial page. External addresses are shown for confirmation first, so this
// address can never silently bounce someone to another site.
export const Route = createFileRoute('/r/$code')({
  component: QrLanding,
})

type State =
  | { kind: 'loading' }
  | { kind: 'notfound' }
  | { kind: 'error' }
  | { kind: 'external'; url: string; host: string }

function QrLanding() {
  const { code } = Route.useParams()
  const resolve = useMutation(api.qr.resolve)
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  // Resolving counts a scan, so make sure it runs once per visit (React
  // strict mode runs effects twice in development).
  const lastRun = useRef<string | null>(null)

  useEffect(() => {
    const runKey = `${code}:${attempt}`
    if (lastRun.current === runKey) return
    lastRun.current = runKey

    let cancelled = false
    setState({ kind: 'loading' })
    resolve({ code })
      .then((target) => {
        if (cancelled) return
        if (!target) {
          setState({ kind: 'notfound' })
        } else if (target.kind === 'page') {
          void navigate({
            to: '/m/$slug',
            params: { slug: target.slug },
            replace: true,
          })
        } else {
          try {
            const parsed = new URL(target.url)
            if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
              setState({ kind: 'notfound' })
            } else {
              setState({ kind: 'external', url: parsed.toString(), host: parsed.host })
            }
          } catch {
            setState({ kind: 'notfound' })
          }
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [code, attempt, resolve, navigate])

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-center">
      <div className="w-full max-w-sm space-y-4">
        {state.kind === 'loading' && (
          <p className="text-sm text-muted-foreground">Открываю страницу памяти…</p>
        )}

        {state.kind === 'notfound' && (
          <>
            <h1 className="text-xl font-semibold">Ссылка недоступна</h1>
            <p className="text-sm text-muted-foreground">
              Возможно, страница закрыта или этот код отключён.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/">На главную</Link>
            </Button>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <h1 className="text-xl font-semibold">Не удалось открыть</h1>
            <p className="text-sm text-muted-foreground">
              Проверьте интернет и попробуйте ещё раз.
            </p>
            <Button className="w-full" onClick={() => setAttempt((n) => n + 1)}>
              Повторить
            </Button>
          </>
        )}

        {state.kind === 'external' && (
          <>
            <h1 className="text-xl font-semibold">Переход на другой сайт</h1>
            <p className="text-sm text-muted-foreground">
              Этот код ведёт на сайт{' '}
              <span className="break-all font-medium text-foreground">{state.host}</span>.
            </p>
            <Button asChild className="w-full">
              <a href={state.url} rel="noopener noreferrer">
                Перейти
              </a>
            </Button>
          </>
        )}
      </div>
    </main>
  )
}
