import { useState } from 'react'
import { useQuery } from 'convex/react'
import { Check } from 'lucide-react'

import { api } from '@/../convex/_generated/api'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

// Was a fixed list in this file; now managed by admins (convex/adminContent.ts)
// and read here through content.listEpitaphTemplates. Kept as a fallback for
// the moment before that query returns, so the picker never flashes empty.
const FALLBACK_TEMPLATES = [
  'Вечная память',
  'Любим и помним',
  'Ты навсегда в наших сердцах',
  'Пусть земля будет пухом',
  'Светлая память',
  'Никогда не забудем',
]

const CUSTOM_OPTION = '__custom__'

export function EpitaphPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const loaded = useQuery(api.content.listEpitaphTemplates, {})
  const templates = loaded ?? FALLBACK_TEMPLATES

  const matchedTemplate = templates.find((t) => t === value)
  const [mode, setMode] = useState<string>(
    value && !matchedTemplate ? CUSTOM_OPTION : matchedTemplate || '',
  )

  function selectTile(next: string) {
    setMode(next)
    if (next === CUSTOM_OPTION) {
      onChange('')
    } else {
      onChange(next)
    }
  }

  if (loaded === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {templates.map((template) => {
        const selected = mode === template
        return (
          <button
            key={template}
            type="button"
            onClick={() => selectTile(template)}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-left transition-colors ${
              selected
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card'
            }`}
          >
            <span className="text-foreground">{template}</span>
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

      <button
        type="button"
        onClick={() => selectTile(CUSTOM_OPTION)}
        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-left transition-colors ${
          mode === CUSTOM_OPTION
            ? 'border-primary bg-primary/5'
            : 'border-border bg-card'
        }`}
      >
        <span className="text-foreground">Свой текст</span>
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
            mode === CUSTOM_OPTION
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/40'
          }`}
        >
          {mode === CUSTOM_OPTION && <Check className="h-3.5 w-3.5" />}
        </span>
      </button>

      {mode === CUSTOM_OPTION && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Введите свою эпитафию"
          autoFocus
        />
      )}
    </div>
  )
}
