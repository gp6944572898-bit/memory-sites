import { ChevronLeft, ChevronRight } from 'lucide-react'

export function WizardProgress({
  step,
  total,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  showLabel = true,
}: {
  step: number
  total: number
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onForward: () => void
  showLabel?: boolean
}) {
  return (
    <div>
      <div className="grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2">
        <div className="flex justify-start">
          {canGoBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Назад"
              className="flex h-6 w-6 items-center justify-center text-foreground"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={3} />
            </button>
          )}
        </div>

        <div className="flex gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i < step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        <div className="flex justify-end">
          {canGoForward && (
            <button
              type="button"
              onClick={onForward}
              aria-label="Далее"
              className="flex h-6 w-6 items-center justify-center text-primary"
            >
              <ChevronRight className="h-6 w-6" strokeWidth={3} />
            </button>
          )}
        </div>
      </div>
      {showLabel && (
        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          Шаг {step} из {total}
        </p>
      )}
    </div>
  )
}
