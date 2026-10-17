// Role-based access for the admin panel.
//
// Kept deliberately free of anything Convex-specific except the two small
// ctx helpers at the bottom, so the permission matrix is plain TypeScript and
// moves with the project if the backend ever changes.
import { getAuthUserId } from "@convex-dev/auth/server"

import type { Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"

export type AdminRole = "main_admin" | "moderator"

export type Capability =
  | "complaints.manage" // react to complaints: hide, warn, block
  | "guestbook.moderate" // approve / hide memory-book messages
  | "guestbook.delete" // delete a memory-book message for good
  | "pages.view" // browse every page on the platform
  | "pages.block" // block / unblock a page
  | "pages.delete"
  | "users.manage" // search users, view profiles, block / unblock
  | "finance.manage" // campaigns, transactions, manual actions
  | "admins.manage" // add / remove admins, change roles
  | "platform.settings" // stickers catalog, epitaph templates, themes
  | "qr.manage" // QR codes for headstones and the public site address

const MODERATOR_CAPABILITIES: readonly Capability[] = [
  "complaints.manage",
  "guestbook.moderate",
  "guestbook.delete",
  "pages.view",
  "pages.block",
]

const MAIN_ADMIN_CAPABILITIES: readonly Capability[] = [
  ...MODERATOR_CAPABILITIES,
  "pages.delete",
  "users.manage",
  "finance.manage",
  "admins.manage",
  "platform.settings",
  "qr.manage",
]

export const ROLE_CAPABILITIES: Record<AdminRole, readonly Capability[]> = {
  main_admin: MAIN_ADMIN_CAPABILITIES,
  moderator: MODERATOR_CAPABILITIES,
}

export function hasCapability(
  role: AdminRole | null | undefined,
  capability: Capability,
): boolean {
  if (!role) return false
  return ROLE_CAPABILITIES[role].includes(capability)
}

// ---- ctx helpers -----------------------------------------------------------

type Ctx = QueryCtx | MutationCtx

export async function isUserBlocked(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<boolean> {
  const block = await ctx.db
    .query("userBlocks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first()
  return block !== null
}

// The signed-in user's admin role, or null. A blocked account loses its admin
// access as well.
export async function getAdminRole(
  ctx: Ctx,
): Promise<{ userId: Id<"users">; role: AdminRole } | null> {
  const userId = await getAuthUserId(ctx)
  if (!userId) return null
  if (await isUserBlocked(ctx, userId)) return null
  const row = await ctx.db
    .query("adminRoles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first()
  if (!row) return null
  return { userId, role: row.role }
}

// Throws unless the signed-in user's role grants `capability`.
export async function requireCapability(
  ctx: Ctx,
  capability: Capability,
): Promise<{ userId: Id<"users">; role: AdminRole }> {
  const admin = await getAdminRole(ctx)
  if (!admin) throw new Error("Требуются права администратора")
  if (!hasCapability(admin.role, capability)) {
    throw new Error("Недостаточно прав для этого действия")
  }
  return admin
}
