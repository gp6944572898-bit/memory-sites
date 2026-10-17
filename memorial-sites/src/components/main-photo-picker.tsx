import { Check } from 'lucide-react'

export function MainPhotoPicker({
  albumUrls,
  value,
  onChange,
}: {
  albumUrls: string[]
  value: string | undefined
  onChange: (url: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {albumUrls.map((url) => {
        const selected = value === url
        return (
          <button
            key={url}
            type="button"
            onClick={() => onChange(url)}
            className="relative aspect-square overflow-hidden rounded-lg"
          >
            <img src={url} alt="" className="h-full w-full object-cover" />
            <span
              className={`absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-white bg-black/30'
              }`}
            >
              {selected && <Check className="h-3.5 w-3.5" />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
