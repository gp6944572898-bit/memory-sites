import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'

import { AdminGate, AdminShell } from '@/components/admin/admin-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  backend,
  CAMPAIGN_STATUS_LABEL,
  type CampaignRow,
  type CampaignStatus,
  type ContributionRow,
} from '@/lib/backend'

export const Route = createFileRoute('/finance')({ component: FinanceRoute })

const FILTERS: { key: CampaignStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'active', label: 'Идут' },
  { key: 'completed', label: 'Собраны' },
  { key: 'expired', label: 'Истекли' },
]

const STATUS_VARIANT: Record<CampaignStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  completed: 'outline',
  expired: 'secondary',
}

const rub = (n: number) => `${n.toLocaleString('ru-RU')} ₽`
const formatDateTime = (ms: number) =>
  new Date(ms).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function FinanceRoute() {
  return (
    <AdminGate>
      {(me) => (
        <AdminShell me={me} title="Сборы и платежи">
          {me.capabilities.includes('finance.manage') ? (
            <FinancePage />
          ) : (
            <p className="text-sm text-muted-foreground">Раздел доступен только главному админу.</p>
          )}
        </AdminShell>
      )}
    </AdminGate>
  )
}

function FinancePage() {
  const [filter, setFilter] = useState<CampaignStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim(), 300)
  const [openId, setOpenId] = useState<string | null>(null)

  const result = useQuery(backend.campaigns, {
    ...(filter !== 'all' ? { status: filter } : {}),
    ...(query ? { search: query } : {}),
  })

  return (
    <div className="space-y-4">
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 md:mx-0 md:px-0">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            variant={f.key === filter ? 'default' : 'outline'}
            className="shrink-0"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <Input
        type="search"
        placeholder="Поиск по странице или названию сбора"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {result === undefined ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : result.rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Ничего не найдено</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Найдено: {result.rows.length}
            {result.truncated && ' (показаны первые 200)'}
          </p>
          <div className="space-y-3">
            {result.rows.map((row) => (
              <CampaignCard
                key={row._id}
                row={row}
                open={openId === row._id}
                onToggle={() => setOpenId((id) => (id === row._id ? null : row._id))}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function CampaignCard({
  row,
  open,
  onToggle,
}: {
  row: CampaignRow
  open: boolean
  onToggle: () => void
}) {
  const percent = row.goalRub > 0 ? Math.min(100, Math.round((row.collectedRub / row.goalRub) * 100)) : 0
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{row.pageName}</p>
            <p className="text-xs text-muted-foreground">{row.title}</p>
          </div>
          <Badge variant={STATUS_VARIANT[row.status]} className="shrink-0">
            {CAMPAIGN_STATUS_LABEL[row.status]}
          </Badge>
        </div>

        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {rub(row.collectedRub)} из {rub(row.goalRub)} · {row.participantsCount}{' '}
            {row.participantsCount === 1 ? 'участник' : 'участников'}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          {row.status === 'active' ? `Приём до ${formatDateTime(row.deadlineAt)}` : `Завершён ${formatDateTime(row.deadlineAt)}`}
        </p>

        <Button variant="outline" onClick={onToggle}>
          {open ? 'Скрыть взносы' : 'Показать взносы'}
        </Button>

        {open && <ContributionsPanel campaignId={row._id} />}
      </CardContent>
    </Card>
  )
}

function ContributionsPanel({ campaignId }: { campaignId: string }) {
  const detail = useQuery(backend.campaignDetail, { campaignId })

  if (detail === undefined) return <Skeleton className="h-24 w-full" />
  if (detail === null) {
    return <p className="text-sm text-muted-foreground">Сбор не найден</p>
  }

  return (
    <div className="space-y-2 border-t pt-3">
      {detail.description && <p className="text-sm text-muted-foreground">{detail.description}</p>}
      {detail.contributions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Взносов пока нет</p>
      ) : (
        detail.contributions.map((c) => <ContributionRowItem key={c._id} contribution={c} />)
      )}
    </div>
  )
}

const CONTRIBUTION_STATUS_LABEL: Record<ContributionRow['status'], string> = {
  held: 'Удержан',
  captured: 'Списан',
  cancelled: 'Отменён',
}

function ContributionRowItem({ contribution }: { contribution: ContributionRow }) {
  const cancel = useMutation(backend.cancelContribution)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      await cancel({ contributionId: contribution._id })
      setConfirming(false)
    } catch {
      setError('Не удалось отменить взнос')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1 rounded-md border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">
          {contribution.anonymous ? 'Аноним' : contribution.donorName ?? 'Без имени'}
        </p>
        <p className="shrink-0 font-medium tabular-nums">{rub(contribution.amountRub)}</p>
      </div>
      {contribution.message && <p className="text-muted-foreground">{contribution.message}</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {CONTRIBUTION_STATUS_LABEL[contribution.status]} · {formatDateTime(contribution.createdAt)}
        </p>
        {contribution.status === 'held' &&
          (confirming ? (
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" disabled={busy} onClick={() => void run()}>
                {busy ? 'Отменяю…' : 'Да, отменить'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Нет
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
              Отменить взнос
            </Button>
          ))}
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
