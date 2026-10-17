import type { Id } from "./_generated/dataModel"
// Admin management: who has access to the admin panel and with which role.
// Main admin only (capability admins.manage). Every change is written to the
// audit log.
//
// Nobody can change or remove their own role. Since only main admins can call
// these functions, that alone guarantees at least one main admin always
// remains.
import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { logAction } from "./auditLog"
import { requireCapability } from "./permissions"

const roleValidator = v.union(v.literal("main_admin"), v.literal("moderator"))

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      userId: v.id("users"),
      name: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
      role: roleValidator,
      blocked: v.boolean(),
      grantedByEmail: v.union(v.string(), v.null()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireCapability(ctx, "admins.manage")
    const roles = await ctx.db.query("adminRoles").take(200)
    const rows: Array<{
      userId: Id<"users">
      name: string | null
      email: string | null
      role: "main_admin" | "moderator"
      blocked: boolean
      grantedByEmail: string | null
      createdAt: number
    }> = []
    for (const row of roles) {
      const user = await ctx.db.get(row.userId)
      const grantedBy = row.grantedBy ? await ctx.db.get(row.grantedBy) : null
      const block = await ctx.db
        .query("userBlocks")
        .withIndex("by_user", (q) => q.eq("userId", row.userId))
        .first()
      rows.push({
        userId: row.userId,
        name: user?.name ?? null,
        email: user?.email ?? null,
        role: row.role,
        blocked: block !== null,
        grantedByEmail: grantedBy?.email ?? null,
        createdAt: row._creationTime,
      })
    }
    return rows.sort((a, b) => a.createdAt - b.createdAt)
  },
})

// Give an already registered user access to the panel.
export const add = mutation({
  args: { userId: v.id("users"), role: roleValidator },
  returns: v.null(),
  handler: async (ctx, { userId, role }) => {
    const admin = await requireCapability(ctx, "admins.manage")
    const user = await ctx.db.get(userId)
    if (!user || !user.email) {
      throw new Error("Можно выбрать только зарегистрированного пользователя")
    }
    const blocked = await ctx.db
      .query("userBlocks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()
    if (blocked) throw new Error("Пользователь заблокирован")
    const existing = await ctx.db
      .query("adminRoles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()
    if (existing) throw new Error("Этот пользователь уже админ")

    await ctx.db.insert("adminRoles", { userId, role, grantedBy: admin.userId })
    await logAction(ctx, {
      kind: "admin_role",
      action: "grant_role",
      targetId: userId,
      actorId: admin.userId,
      reason: role,
    })
    return null
  },
})

export const setRole = mutation({
  args: { userId: v.id("users"), role: roleValidator },
  returns: v.null(),
  handler: async (ctx, { userId, role }) => {
    const admin = await requireCapability(ctx, "admins.manage")
    if (userId === admin.userId) throw new Error("Нельзя менять собственную роль")
    const row = await ctx.db
      .query("adminRoles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()
    if (!row) throw new Error("Этот пользователь не админ")
    if (row.role === role) return null

    await ctx.db.patch(row._id, { role })
    await logAction(ctx, {
      kind: "admin_role",
      action: "change_role",
      targetId: userId,
      actorId: admin.userId,
      reason: `${row.role} -> ${role}`,
    })
    return null
  },
})

export const remove = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const admin = await requireCapability(ctx, "admins.manage")
    if (userId === admin.userId) throw new Error("Нельзя снять роль с самого себя")
    const row = await ctx.db
      .query("adminRoles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()
    if (!row) throw new Error("Этот пользователь не админ")

    await ctx.db.delete(row._id)
    await logAction(ctx, {
      kind: "admin_role",
      action: "revoke_role",
      targetId: userId,
      actorId: admin.userId,
      reason: row.role,
    })
    return null
  },
})
