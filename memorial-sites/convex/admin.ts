// Backend for the admin panels. Every function here checks the caller's role
// through ./permissions before doing anything.
import { v } from "convex/values"

import { internalMutation, mutation, query } from "./_generated/server"
import { logAction } from "./auditLog"
import {
  getAdminRole,
  requireCapability,
  ROLE_CAPABILITIES,
} from "./permissions"

const roleValidator = v.union(v.literal("main_admin"), v.literal("moderator"))

// Who am I in the admin panel? null = not an admin (or not signed in).
export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      role: roleValidator,
      capabilities: v.array(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const admin = await getAdminRole(ctx)
    if (!admin) return null
    return {
      userId: admin.userId,
      role: admin.role,
      capabilities: [...ROLE_CAPABILITIES[admin.role]],
    }
  },
})

// Bootstrap / support tool: give an existing user (they must have signed in at
// least once) an admin role. Internal on purpose — run it from the Convex
// dashboard or CLI, e.g.
//   npx convex run admin:grantRoleByEmail '{"email":"you@example.com","role":"main_admin"}'
export const grantRoleByEmail = internalMutation({
  args: { email: v.string(), role: roleValidator },
  returns: v.id("adminRoles"),
  handler: async (ctx, { email, role }) => {
    const wanted = email.trim().toLowerCase()
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", wanted))
      .first()
    if (!user) {
      throw new Error(
        "Пользователь с такой почтой не найден — пусть сначала войдёт на сайт",
      )
    }
    const existing = await ctx.db
      .query("adminRoles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first()
    if (existing) {
      await ctx.db.patch(existing._id, { role })
      return existing._id
    }
    return await ctx.db.insert("adminRoles", { userId: user._id, role })
  },
})

export const setUserBlocked = mutation({
  args: {
    userId: v.id("users"),
    blocked: v.boolean(),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, blocked, reason }) => {
    const admin = await requireCapability(ctx, "users.manage")

    const existing = await ctx.db
      .query("userBlocks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()

    if (!blocked) {
      if (existing) {
        await ctx.db.delete(existing._id)
        await logAction(ctx, {
          kind: "user",
          action: "unblock",
          targetId: userId,
          actorId: admin.userId,
        })
      }
      return null
    }

    if (userId === admin.userId) {
      throw new Error("Нельзя заблокировать самого себя")
    }
    const targetRole = await ctx.db
      .query("adminRoles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first()
    if (targetRole?.role === "main_admin") {
      throw new Error(
        "Сначала снимите с пользователя роль главного админа, потом блокируйте",
      )
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        reason: reason?.trim() || undefined,
        blockedBy: admin.userId,
      })
    } else {
      await ctx.db.insert("userBlocks", {
        userId,
        reason: reason?.trim() || undefined,
        blockedBy: admin.userId,
      })
    }
    await logAction(ctx, {
      kind: "user",
      action: "block",
      targetId: userId,
      actorId: admin.userId,
      reason: reason?.trim() || undefined,
    })
    return null
  },
})

export const setPageBlocked = mutation({
  args: { pageId: v.id("pages"), blocked: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { pageId, blocked }) => {
    const admin = await requireCapability(ctx, "pages.block")
    const page = await ctx.db.get(pageId)
    if (!page) throw new Error("Страница не найдена")

    if (blocked) {
      if (page.status === "blocked") return null
      await ctx.db.patch(pageId, {
        status: "blocked",
        statusBeforeBlock: page.status,
      })
      await logAction(ctx, {
        kind: "page",
        action: "block",
        targetId: pageId,
        pageId,
        actorId: admin.userId,
      })
      return null
    }

    if (page.status !== "blocked") return null
    // Restore what the page was before. If that was never recorded, fall back
    // to the unpaid state rather than granting a paid one for free.
    await ctx.db.patch(pageId, {
      status: page.statusBeforeBlock ?? "pending_payment",
      statusBeforeBlock: undefined,
    })
    await logAction(ctx, {
      kind: "page",
      action: "unblock",
      targetId: pageId,
      pageId,
      actorId: admin.userId,
    })
    return null
  },
})
