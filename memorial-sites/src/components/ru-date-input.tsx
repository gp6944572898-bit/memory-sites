import { useState } from 'react'
import { ru } from 'date-fns/locale'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

// value/onChange use ISO format (yyyy-MM-dd) to stay consistent with the
// data layer; display is fully localized to Russian.
export function RuDateInput({
  value,
  onChange,
  placeholder = 'Выберите дату',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? new Date(value + 'T00:00:00') : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start font-normal"
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selected ? format(selected, 'd MMMM yyyy', { locale: ru }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Calendar
          mode="single"
          locale={ru}
          selected={selected}
          captionLayout="dropdown"
          className="w-full"
          onSelect={(date) => {
            if (date) {
              const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
              onChange(iso)
              setOpen(false)
            }
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
