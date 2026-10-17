// One place that writes the audit trail (table moderationLog).
import type { Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"

export type AuditKind = "guestbook" | "user" | "page" | "admin_role" | "qr" | "content"
export type AuditAction =
  | "approve"
  | "hide"
  | "restore"
  | "delete"
  | "auto_purge"
  | "block"
  | "unblock"
  | "grant_role"
  | "change_role"
  | "revoke_role"
  | "create"
  | "update"

export async function logAction(
  ctx: MutationCtx,
  entry: {
    kind: AuditKind
    action: AuditAction
    targetId: string
    pageId?: Id<"pages">
    actorId?: Id<"users">
    reason?: string
  },
) {
  await ctx.db.insert("moderationLog", entry)
}
