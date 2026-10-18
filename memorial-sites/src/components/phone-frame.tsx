export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[300px] flex-col overflow-hidden rounded-[2.5rem] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl">
      <div className="relative flex h-6 shrink-0 items-center justify-center bg-neutral-900">
        <div className="h-4 w-24 rounded-full bg-black" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[1.5rem] bg-background">
        {children}
      </div>
    </div>
  )
}
