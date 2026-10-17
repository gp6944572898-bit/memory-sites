// Pure rules for the memory book — no database access, so they are easy to
// test and to move if the backend ever changes.

export const MAX_NAME_LENGTH = 60
export const MAX_TEXT_LENGTH = 2000
// Best-effort limit per browser (anonymous authors cannot be told apart
// otherwise).
export const MAX_MESSAGES_PER_HOUR = 5
export const HIDDEN_RETENTION_DAYS = 90
// A message that waits for the owner longer than this is flagged in the admin
// queue as overdue.
export const OWNER_OVERDUE_DAYS = 14

export type MessageStatus =
  | "pending_platform"
  | "pending_owner"
  | "published"
  | "hidden"

export type HeldReason = "link" | "phone"

const LINK_PATTERN =
  /(https?:\/\/|www\.|\b[a-zа-яё0-9-]+\.(?:ru|com|net|org|su|io|me|ly|xyz|info|biz|cc|рф)\b)/i
// A phone number: "+<country>" or a leading 7/8, then 9-12 more digits, with
// spaces, dashes, dots and brackets allowed in between. Plain dates such as
// "12.05.1950" do not match.
const PHONE_PATTERN = /(?:\+\d|\b[78])(?:[\s\-().]*\d){9,12}/

// Messages with links or phone numbers are spam-prone: they always go to
// platform review, whatever the owner's settings are.
export function detectHold(text: string): HeldReason | null {
  if (LINK_PATTERN.test(text)) return "link"
  if (PHONE_PATTERN.test(text)) return "phone"
  return null
}

// Platform moderation always comes first; only then the owner's own review.
export function initialStatus(opts: {
  platformModeration: boolean
  requireApproval: boolean
  held: HeldReason | null
}): MessageStatus {
  if (opts.platformModeration || opts.held) return "pending_platform"
  if (opts.requireApproval) return "pending_owner"
  return "published"
}

// What happens after platform moderators approve a message.
export function statusAfterPlatformApproval(
  requireApproval: boolean,
): MessageStatus {
  return requireApproval ? "pending_owner" : "published"
}

// Messages written before statuses existed only have `approved`.
export function effectiveStatus(message: {
  status?: MessageStatus
  approved: boolean
}): MessageStatus {
  if (message.status) return message.status
  return message.approved ? "published" : "pending_owner"
}

export function isOverdue(createdAt: number, now: number): boolean {
  return now - createdAt > OWNER_OVERDUE_DAYS * 86_400_000
}

export const HIDE_REASONS = [
  "spam",
  "insult",
  "personal_data",
  "illegal",
  "other",
] as const
export type HideReason = (typeof HIDE_REASONS)[number]
