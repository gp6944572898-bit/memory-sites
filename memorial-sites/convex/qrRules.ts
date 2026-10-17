// Pure rules for QR codes — no database access, easy to test and to move.

// No 0/O, 1/I/L: a code has to survive being read off stone or paper by eye.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
export const CODE_LENGTH = 6

export function generateCode(random: () => number = Math.random): string {
  let code = ""
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  }
  return code
}

// 8 digits, never starting with 0, so it survives being typed into a
// spreadsheet or read over the phone.
export function generateNumericId(random: () => number = Math.random): string {
  const first = Math.floor(random() * 9) + 1
  const rest = Math.floor(random() * 10_000_000)
    .toString()
    .padStart(7, "0")
  return `${first}${rest}`
}

// Scanners and people may change case or add spaces; codes are stored upper-case.
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase()
}

// External targets must be plain web addresses. Anything else (javascript:,
// data:, file:, addresses with a login inside) is refused.
export function validateTargetUrl(input: string): string {
  const trimmed = input.trim()
  if (trimmed.length === 0 || trimmed.length > 2000) {
    throw new Error("Некорректный адрес")
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error("Некорректный адрес")
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Адрес должен начинаться с http:// или https://")
  }
  if (url.username || url.password) {
    throw new Error("Адрес не должен содержать логин и пароль")
  }
  return url.toString()
}

// The site address that gets printed inside every QR image: origin only,
// https only, no trailing slash.
export function normalizeBaseUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error("Некорректный адрес сайта")
  }
  if (url.protocol !== "https:") {
    throw new Error("Адрес сайта должен начинаться с https://")
  }
  if (url.username || url.password) {
    throw new Error("Адрес сайта не должен содержать логин и пароль")
  }
  return url.origin
}

// Development / preview hosts. A code printed with one of these addresses would
// stop working the day the project moves, so printing is warned against.
const TEMPORARY_HOST_SUFFIXES = [
  ".macaly.dev",
  ".macaly.app",
  ".convex.cloud",
  ".convex.site",
  ".vercel.app",
  ".netlify.app",
  ".onrender.com",
  ".replit.app",
  ".repl.co",
]

export function isTemporaryHost(baseUrl: string): boolean {
  let host: string
  try {
    host = new URL(baseUrl).hostname.toLowerCase()
  } catch {
    return true
  }
  if (host === "localhost" || host.endsWith(".localhost")) return true
  return TEMPORARY_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

// Number of days the scan chart looks back, and per-day bucketing that follows
// the admin's own time zone (offset in minutes east of UTC, e.g. Moscow = 180).
export function bucketByDay(
  timestamps: number[],
  now: number,
  days: number,
  tzOffsetMinutes: number,
): Array<{ dayStart: number; count: number }> {
  const DAY = 86_400_000
  const offset = tzOffsetMinutes * 60_000
  const today = Math.floor((now + offset) / DAY) * DAY - offset
  const buckets = new Map<number, number>()
  for (let i = days - 1; i >= 0; i--) buckets.set(today - i * DAY, 0)
  for (const t of timestamps) {
    const dayStart = Math.floor((t + offset) / DAY) * DAY - offset
    if (buckets.has(dayStart)) buckets.set(dayStart, buckets.get(dayStart)! + 1)
  }
  return [...buckets.entries()].map(([dayStart, count]) => ({ dayStart, count }))
}
