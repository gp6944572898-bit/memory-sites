import { Slider } from '@/components/ui/slider'

export function SliderWithZeroMark({
  value,
  min,
  max,
  step,
  neutralValue,
  onValueChange,
}: {
  value: number
  min: number
  max: number
  step: number
  neutralValue?: number
  onValueChange: (value: number) => void
}) {
  const neutralPercent =
    neutralValue !== undefined
      ? ((neutralValue - min) / (max - min)) * 100
      : undefined

  return (
    <div className="relative pt-1">
      {neutralPercent !== undefined && (
        <div
          className="pointer-events-none absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded-full bg-foreground/30"
          style={{ left: `calc(${neutralPercent}% - 1px)` }}
        />
      )}
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onValueChange(v[0] ?? value)}
      />
    </div>
  )
}
