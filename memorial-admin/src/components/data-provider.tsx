import { ConvexAuthProvider } from "@convex-dev/auth/react"
import { ConvexReactClient } from "convex/react"

// The admin app reads and writes the SAME data as the public MemorialSites
// site, so it connects to that deployment (not to a backend of its own).
const DATA_URL = (import.meta as any).env.VITE_DATA_CONVEX_URL as
  | string
  | undefined

const client = DATA_URL ? new ConvexReactClient(DATA_URL) : null

export default function DataProvider({
  children,
}: {
  children: React.ReactNode
}) {
  if (!client) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          Не задан адрес базы данных (VITE_DATA_CONVEX_URL). Админка не может
          подключиться к данным сайта.
        </p>
      </div>
    )
  }
  return <ConvexAuthProvider client={client}>{children}</ConvexAuthProvider>
}
