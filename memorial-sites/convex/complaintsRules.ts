// Pure rules for complaints — no database access, easy to test and to move.

export const MAX_DETAILS_LENGTH = 1000
export const MAX_CONTACT_LENGTH = 200
// Best-effort limit per browser (reporters are anonymous otherwise).
export const MAX_COMPLAINTS_PER_HOUR = 5

export const COMPLAINT_REASONS = [
  "spam",
  "insult",
  "personal_data",
  "illegal",
  "fake_info",
  "other",
] as const
export type ComplaintReason = (typeof COMPLAINT_REASONS)[number]

export type ComplaintResolution = "hidden" | "deleted" | "blocked" | "warned" | "dismissed"

// Which resolutions make sense for which kind of target — a page can't be
// "hidden" (only blocked or dismissed), a message can't be "blocked".
export const RESOLUTIONS_FOR: Record<"page" | "message", readonly ComplaintResolution[]> = {
  page: ["blocked", "warned", "dismissed"],
  message: ["hidden", "deleted", "warned", "dismissed"],
}

export function isValidResolution(
  targetType: "page" | "message",
  resolution: ComplaintResolution,
): boolean {
  return RESOLUTIONS_FOR[targetType].includes(resolution)
}
