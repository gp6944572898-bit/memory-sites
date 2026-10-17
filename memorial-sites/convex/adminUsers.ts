// Users section of the admin panel: find registered users, open a profile with
// their pages. Blocking / unblocking lives in admin.ts (setUserBlocked).
//
// Only users who registered (have an e-mail) are listed — the anonymous
// visitor accounts the site creates automatically are not people to manage.
//
// NOTE: reads up to MAX_SCANNED users and filters in memory — fine at MVP
// scale; move to indexed search when the platform grows.
import { v, type Infer } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import { query, type QueryCtx } from "./_generated/server"
import { requireCapability } from "./permissions"

const MAX_SCANNED = 1000
const MAX_ROWS = 200

const roleValidator = v.union(v.literal("main_admin"), v.literal("moderator"))

const rowValidator = v.object({
  _id: v.id("users"),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  createdAt: v.number(),
  blocked: v.boolean(),
  adminRole: v.union(roleValidator, v.null()),
  pagesCount: v.number(),
})

async function toRow(
  ctx: QueryCtx,
  user: Doc<"users">,
): Promise<Infer<typeof rowValidator>> {
  const [block, role, pages] = await Promise.all([
    ctx.db
      .query("userBlocks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first(),
    ctx.db
      .query("adminRoles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first(),
    ctx.db
      .query("pages")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .take(100),
  ])
  return {
    _id: user._id,
    name: user.name ?? null,
    email: user.email ?? null,
    createdAt: user._creationTime,
    blocked: block !== null,
    adminRole: role?.role ?? null,
    pagesCount: pages.length,
  }
}

export const list = query({
  args: { search: v.optional(v.string()) },
  returns: v.object({ rows: v.array(rowValidator), truncated: v.boolean() }),
  handler: async (ctx, { search }) => {
    await requireCapability(ctx, "users.manage")
    const needle = search?.trim().toLowerCase()

    // Users with an e-mail only (undefined sorts before any string).
    const registered = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.gt("email", ""))
      .take(MAX_SCANNED)
    const matching = registered
      .filter(
        (u) =>
          !needle ||
          (u.email ?? "").toLowerCase().includes(needle) ||
          (u.name ?? "").toLowerCase().includes(needle),
      )
      .sort((a, b) => b._creationTime - a._creationTime)

    const rows: Array<Awaited<ReturnType<typeof toRow>>> = []
    for (const user of matching.slice(0, MAX_ROWS)) rows.push(await toRow(ctx, user))
    return { rows, truncated: matching.length > MAX_ROWS }
  },
})

export const get = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({
      user: rowValidator,
      blockReason: v.union(v.string(), v.null()),
      pages: v.array(
        v.object({
          _id: v.id("pages"),
          slug: v.string(),
          fullName: v.string(),
          status: v.union(
            v.literal("active"),
            v.literal("reduced"),
            v.literal("pending_payment"),
            v.literal("blocked"),
          ),
          createdAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { userId }) => {
    await requireCapability(ctx, "users.manage")
    const user = await ctx.db.get(userId)
    if (!user) return null
    const [block, pages] = await Promise.all([
      ctx.db
        .query("userBlocks")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first(),
      ctx.db
        .query("pages")
        .withIndex("by_owner", (q) => q.eq("ownerId", userId))
        .order("desc")
        .take(100),
    ])
    return {
      user: await toRow(ctx, user),
      blockReason: block?.reason ?? null,
      pages: pages.map((p) => ({
        _id: p._id,
        slug: p.slug,
        fullName: p.fullName,
        status: p.status,
        createdAt: p._creationTime,
      })),
    }
  },
})
