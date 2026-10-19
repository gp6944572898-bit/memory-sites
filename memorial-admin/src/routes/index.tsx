import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useState, type ReactNode } from 'react'

import { AdminGate, AdminShell } from '@/components/admin/admin-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { backend, type Me } from '@/lib/backend'

export const Route = createFileRoute('/')({ component: DashboardPage })

const PERIODS = [
  { days: 7, label: '7 дн' },
  { days: 30, label: '30 дн' },
  { days: 90, label: '90 дн' },
  { days: 0, label: 'Всё время' },
]

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`

function DashboardPage() {
  return (
    <AdminGate>
      {(me) => (
        <AdminShell me={me} title="Дашборд">
          <Dashboard me={me} />
        </AdminShell>
      )}
    </AdminGate>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: ReactNode
  tone?: 'danger'
}) {
  return (
    <div>
      <p className="truncate text-[11px] leading-tight text-muted-foreground">{label}</p>
      <p
        className={`text-base font-semibold leading-tight tabular-nums ${
          tone === 'danger' ? 'text-destructive' : ''
        }`}
      >
        {value}
      </p>
    </div>
  )
}

// One shared card holds every group, so there is only one border/shadow/
// padding pair on the page instead of three — that's most of the "air".
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 border-t pt-2 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">{children}</div>
    </div>
  )
}

function Dashboard({ me }: { me: Me }) {
  const [periodDays, setPeriodDays] = useState(30)
  const stats = useQuery(backend.dashboard, { periodDays })
  const periodLabel = PERIODS.find((p) => p.days === periodDays)?.label ?? ''

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-1.5">
        {PERIODS.map((p) => (
          <Button
            key={p.days}
            variant={p.days === periodDays ? 'default' : 'outline'}
            className="h-8 px-1 text-[11px]"
            onClick={() => setPeriodDays(p.days)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {stats === undefined ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card className="gap-0 py-3">
          <CardContent className="space-y-2 px-3">
            <Group title="Страницы">
              <Stat label="Всего" value={stats.pages.total} />
              <Stat label={`За ${periodLabel}`} value={stats.pages.createdInPeriod} />
              <Stat label="Активные" value={stats.pages.active} />
              <Stat label="В выкупе" value={stats.pages.pendingPayment} />
              <Stat label="Урезанные" value={stats.pages.reduced} />
              <Stat
                label="Заблок."
                value={stats.pages.blocked}
                tone={stats.pages.blocked > 0 ? 'danger' : undefined}
              />
            </Group>

            <Group title="Сборы">
              <Stat label="Идут" value={stats.campaigns.active} />
              <Stat label="Завершены" value={stats.campaigns.completed} />
              <Stat label="Истекли" value={stats.campaigns.expired} />
            </Group>

            {stats.finance ? (
              <Group title={`Деньги · ${periodLabel}`}>
                <Stat label="Собрано" value={rub(stats.finance.capturedRub)} />
                <Stat label="Удержано" value={rub(stats.finance.heldRub)} />
                <Stat label="Взносов" value={stats.finance.contributionsInPeriod} />
              </Group>
            ) : (
              me.role === 'moderator' && (
                <p className="border-t pt-2 text-[11px] text-muted-foreground">
                  Финансы доступны только главному админу.
                </p>
              )
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
