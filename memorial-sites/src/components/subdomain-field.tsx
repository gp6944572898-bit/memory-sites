import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'

import { api } from '@/../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Домен, под которым будут жить поддомены (например, "example.ru").
// Пока домена нет — переменная не задана, имя только резервируется.
const BASE_DOMAIN = (import.meta as any).env?.VITE_SUBDOMAIN_BASE as string | undefined

// Поле «свой поддомен» с проверкой уникальности по мере ввода.
export function SubdomainField({ ownerToken }: { ownerToken: string }) {
  const claim = useMutation(api.subdomain.claim)
  const [value, setValue] = useState('')
  const [debounced, setDebounced] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Не дёргаем сервер на каждую букву — ждём паузу в наборе.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim().toLowerCase()), 400)
    return () => clearTimeout(timer)
  }, [value])

  const check = useQuery(
    api.subdomain.check,
    debounced ? { subdomain: debounced, ownerToken } : 'skip',
  )
  const typing = value.trim().toLowerCase() !== debounced
  const canSave = !!debounced && !typing && check?.available === true && !saving

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const result = await claim({ ownerToken, subdomain: debounced })
      setSaved(result.subdomain)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить имя')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="w-full max-w-md space-y-2 rounded-lg border p-4 text-left">
      <p className="text-sm font-medium text-foreground">Свой адрес сайта (необязательно)</p>
      <p className="text-xs text-muted-foreground">
        Придумайте короткое имя — латинские буквы, цифры и дефис, от 3 символов.
        {!BASE_DOMAIN && ' Имя будет закреплено за вами; открытие по этому адресу включим, как только подключим домен.'}
      </p>

      {saved ? (
        <p className="text-sm text-foreground">
          Имя закреплено: <span className="font-medium">{BASE_DOMAIN ? `${saved}.${BASE_DOMAIN}` : saved}</span>
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="например, ivanov-1950"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Поддомен"
            />
            {BASE_DOMAIN && (
              <span className="shrink-0 text-sm text-muted-foreground">.{BASE_DOMAIN}</span>
            )}
          </div>

          <div className="min-h-5 text-xs">
            {debounced && typing && <span className="text-muted-foreground">Проверяю…</span>}
            {debounced && !typing && check === undefined && (
              <span className="text-muted-foreground">Проверяю…</span>
            )}
            {!typing && check?.available && <span className="text-green-600">Имя свободно</span>}
            {!typing && check && !check.available && (
              <span className="text-destructive">{check.reason}</span>
            )}
            {error && <span className="text-destructive">{error}</span>}
          </div>

          <Button type="button" variant="outline" disabled={!canSave} onClick={() => void save()}>
            {saving ? 'Сохраняю…' : 'Занять имя'}
          </Button>
        </>
      )}
    </div>
  )
}
