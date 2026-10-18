// Anonymous per-browser token; the server only uses it to limit how fast one
// browser can post messages or send complaints. Falls back to none if storage
// is unavailable (private mode, blocked cookies).
export function getDeviceKey(): string | undefined {
  try {
    const stored = window.localStorage.getItem('guestbook-device')
    if (stored) return stored
    const created = window.crypto.randomUUID()
    window.localStorage.setItem('guestbook-device', created)
    return created
  } catch {
    return undefined
  }
}
