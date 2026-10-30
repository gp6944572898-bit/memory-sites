// Чистые правила для поддоменов — без обращения к базе, легко тестировать.

export const SUBDOMAIN_MIN = 3
export const SUBDOMAIN_MAX = 30

// Имена, которые нельзя отдавать: они заняты служебными адресами и маршрутами.
const RESERVED = new Set([
  "www",
  "admin",
  "api",
  "app",
  "mail",
  "email",
  "smtp",
  "ftp",
  "ns1",
  "ns2",
  "static",
  "assets",
  "cdn",
  "dashboard",
  "login",
  "support",
  "help",
  "blog",
  "status",
  "test",
  "staging",
  "dev",
  "m",
  "r",
  "owner",
  "create",
])

// Регистр не важен: в базе поддомены хранятся строчными.
export function normalizeSubdomain(input: string): string {
  return input.trim().toLowerCase()
}

// Возвращает текст ошибки на русском или null, если имя допустимо.
export function validateSubdomain(input: string): string | null {
  const value = normalizeSubdomain(input)
  if (value.length < SUBDOMAIN_MIN) {
    return `Минимум ${SUBDOMAIN_MIN} символа`
  }
  if (value.length > SUBDOMAIN_MAX) {
    return `Максимум ${SUBDOMAIN_MAX} символов`
  }
  if (!/^[a-z0-9-]+$/.test(value)) {
    return "Только латинские буквы, цифры и дефис"
  }
  if (value.startsWith("-") || value.endsWith("-")) {
    return "Имя не может начинаться или заканчиваться дефисом"
  }
  if (value.includes("--")) {
    return "Два дефиса подряд недопустимы"
  }
  if (RESERVED.has(value)) {
    return "Это имя зарезервировано, выберите другое"
  }
  return null
}
