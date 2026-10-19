import { useAuthActions } from "@convex-dev/auth/react"
import { useConvexAuth, useQuery } from "convex/react"
import { Link } from "@tanstack/react-router"
import {
  BookOpen,
  FileText,
  Flag,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  ShieldCheck,
  Sticker,
  Users,
  Wallet,
  X,
} from "lucide-react"
import { useState, type ReactNode } from "react"

import { SignIn } from "@/components/admin/sign-in"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { backend, ROLE_LABEL, type Me } from "@/lib/backend"

type NavItem = {
  key: string
  label: string
  icon: typeof LayoutDashboard
  // capability from the backend that unlocks this section
  capability: string
  // sections still being built are listed but not clickable
  ready: boolean
  // route of a finished section
  to?: '/' | '/pages' | '/guestbook' | '/qr' | '/content' | '/complaints' | '/users' | '/admins' | '/finance'
}

// One menu for every role: each admin sees only the sections their role allows.
const NAV: NavItem[] = [
  { key: "dashboard", label: "Дашборд", icon: LayoutDashboard, capability: "pages.view", ready: true, to: "/" },
  { key: "pages", label: "Страницы", icon: FileText, capability: "pages.view", ready: true, to: "/pages" },
  { key: "guestbook", label: "Книга памяти", icon: BookOpen, capability: "guestbook.moderate", ready: true, to: "/guestbook" },
  { key: "complaints", label: "Жалобы", icon: Flag, capability: "complaints.manage", ready: true, to: "/complaints" },
  { key: "users", label: "Пользователи", icon: Users, capability: "users.manage", ready: true, to: "/users" },
  { key: "finance", label: "Сборы и платежи", icon: Wallet, capability: "finance.manage", ready: true, to: "/finance" },
  { key: "qr", label: "QR-коды", icon: QrCode, capability: "qr.manage", ready: true, to: "/qr" },
  { key: "content", label: "Стикеры и контент", icon: Sticker, capability: "platform.settings", ready: true, to: "/content" },
  { key: "admins", label: "Админы", icon: ShieldCheck, capability: "admins.manage", ready: true, to: "/admins" },
]

function FullScreenSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner className="size-6" />
    </div>
  )
}

function NoAccess() {
  const { signOut } = useAuthActions()
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">Нет доступа</h1>
        <p className="text-sm text-muted-foreground">
          У этого аккаунта нет прав администратора. Если они должны быть,
          попросите главного админа выдать роль.
        </p>
        <Button variant="outline" className="w-full" onClick={() => void signOut()}>
          Выйти
        </Button>
      </div>
    </div>
  )
}

// Shows sign-in for visitors, "no access" for ordinary accounts, and the
// panel (with the admin's role) for admins. Access is enforced by the backend
// on every call — this gate only decides what to show.
export function AdminGate({ children }: { children: (me: Me) => ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const me = useQuery(backend.me, isAuthenticated ? {} : "skip")

  if (isLoading) return <FullScreenSpinner />
  if (!isAuthenticated) return <SignIn />
  if (me === undefined) return <FullScreenSpinner />
  if (me === null) return <NoAccess />
  return <>{children(me)}</>
}

function NavList({ me, onNavigate }: { me: Me; onNavigate?: () => void }) {
  const items = NAV.filter((item) => me.capabilities.includes(item.capability))
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon
        const base = "flex h-11 items-center gap-3 rounded-md px-3 text-sm"
        if (!item.ready) {
          return (
            <div key={item.key} className={`${base} text-muted-foreground/70`}>
              <Icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              <Badge variant="secondary">скоро</Badge>
            </div>
          )
        }
        return (
          <Link
            key={item.key}
            to={item.to ?? "/"}
            onClick={onNavigate}
            activeOptions={{ exact: true }}
            className={`${base} hover:bg-accent/50`}
            activeProps={{ className: "bg-accent font-medium text-accent-foreground" }}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function AdminShell({
  me,
  title,
  children,
}: {
  me: Me
  title: string
  children: ReactNode
}) {
  const { signOut } = useAuthActions()
  const [menuOpen, setMenuOpen] = useState(false)

  const account = (
    <div className="space-y-2 border-t pt-3">
      <p className="px-3 text-xs text-muted-foreground">{ROLE_LABEL[me.role]}</p>
      <Button
        variant="ghost"
        className="w-full justify-start gap-3"
        onClick={() => void signOut()}
      >
        <LogOut className="size-4" />
        Выйти
      </Button>
    </div>
  )

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between border-r p-3 md:flex">
        <div className="space-y-4">
          <p className="px-3 pt-2 text-base font-semibold">Место памяти</p>
          <NavList me={me} />
        </div>
        {account}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-3 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
          <span className="font-semibold">{title}</span>
        </header>

        {menuOpen && (
          <div className="space-y-3 border-b bg-background p-3 md:hidden">
            <NavList me={me} onNavigate={() => setMenuOpen(false)} />
            {account}
          </div>
        )}

        <main className="mx-auto w-full max-w-4xl flex-1 space-y-3 p-3 md:p-5">
          <h1 className="hidden text-xl font-semibold tracking-tight md:block">
            {title}
          </h1>
          {children}
        </main>
      </div>
    </div>
  )
}
