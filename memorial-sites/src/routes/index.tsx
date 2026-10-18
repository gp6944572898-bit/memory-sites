import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-8">
      <div className="max-w-xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          Место памяти, которое всегда рядом
        </h1>
        <p className="text-lg text-muted-foreground">
          Создайте цифровую страницу памяти для близкого человека: фото,
          история жизни, книга памяти и место на карте — всё в одном месте.
        </p>
      </div>
      <Button asChild size="lg">
        <Link to="/create">Создать мемориал</Link>
      </Button>
    </main>
  )
}
