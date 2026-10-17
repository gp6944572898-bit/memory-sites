// Complaints queue and reactions for the admin panels.
//
// Reacting to a complaint reuses the same actions as ordinary moderation
// (admin.setPageBlocked, adminGuestbook.hide/remove) so there is one place
// that blocks a page or hides a message, not two. "Warn" has no delivery
// channel yet (no owner panel, no notifications) — it is recorded here as a
// resolution so it is visible once the owner panel exists, but nothing is
// sent today.
import { v, type Infer } from "convex/values"

import type { Doc } from "./_generated/dataModel"

import { logAction } from "./auditLog"
import { isValidResolution, type ComplaintResolution } from "./complaintsRules"
import { mutation, query } from "./_generated/server"
import { requireCapability } from "./permissions"

const MAX_ROWS = 200

const resolutionValidator = v.union(
  v.literal("hidden"),
  v.literal("deleted"),
  v.literal("blocked"),
  v.literal("warned"),
  v.literal("dismissed"),
)

const rowValidator = v.object({
  _id: v.id("complaints"),
  targetType: v.union(v.literal("page"), v.literal("message")),
  pageId: v.id("pages"),
  pageName: v.string(),
  pageSlug: v.string(),
  pageStatus: v.string(),
  messageId: v.union(v.id("guestbookMessages"), v.null()),
  messageText: v.union(v.string(), v.null()), // null if the message no longer exists
  messageAuthor: v.union(v.string(), v.null()),
  messageStatus: v.union(v.string(), v.null()),
  reason: v.string(),
  details: v.union(v.string(), v.null()),
  contact: v.union(v.string(), v.null()),
  status: v.union(v.literal("open"), v.literal("resolved")),
  resolution: v.union(resolutionValidator, v.null()),
  createdAt: v.number(),
})

export const list = query({
  args: {
    tab: v.union(v.literal("open"), v.literal("resolved"), v.literal("all")),
    search: v.optional(v.string()),
  },
  returns: v.object({ rows: v.array(rowValidator), truncated: v.boolean() }),
  handler: async (ctx, { tab, search }) => {
    await requireCapability(ctx, "complaints.manage")

    let complaints: Doc<"complaints">[]
    if (tab === "all") {
      complaints = await ctx.db.query("complaints").order("desc").take(MAX_ROWS)
    } else {
      complaints = await ctx.db
        .query("complaints")
        .withIndex("by_status", (q) => q.eq("status", tab))
        .order("desc")
        .take(MAX_ROWS)
    }

    const needle = search?.trim().toLowerCase()
    const pages = new Map<string, { name: string; slug: string; status: string }>()
    const rows: Array<Infer<typeof rowValidator>> = []
    for (const c of complaints) {
      let page = pages.get(c.pageId)
      if (!page) {
        const doc = await ctx.db.get(c.pageId)
        page = { name: doc?.fullName ?? "—", slug: doc?.slug ?? "", status: doc?.status ?? "unknown" }
        pages.set(c.pageId, page)
      }
      const message = c.messageId ? await ctx.db.get(c.messageId) : null

      if (needle) {
        const haystack = [page.name, message?.text ?? "", message?.authorName ?? "", c.details ?? ""]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(needle)) continue
      }

      rows.push({
        _id: c._id,
        targetType: c.targetType,
        pageId: c.pageId,
        pageName: page.name,
        pageSlug: page.slug,
        pageStatus: page.status,
        messageId: c.messageId ?? null,
        messageText: message?.text ?? null,
        messageAuthor: message?.authorName ?? null,
        messageStatus: message?.status ?? (message ? "published" : null),
        reason: c.reason,
        details: c.details ?? null,
        contact: c.contact ?? null,
        status: c.status,
        resolution: c.resolution ?? null,
        createdAt: c._creationTime,
      })
    }
    return { rows, truncated: complaints.length >= MAX_ROWS }
  },
})

// Resolves a complaint and, for "hidden" / "deleted" / "blocked", performs the
// same action the Pages / Guestbook screens use — this is not a parallel path.
export const resolve = mutation({
  args: {
    complaintId: v.id("complaints"),
    resolution: resolutionValidator,
    reason: v.optional(
      v.union(
        v.literal("spam"),
        v.literal("insult"),
        v.literal("personal_data"),
        v.literal("illegal"),
        v.literal("other"),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { complaintId, resolution, reason }) => {
    const admin = await requireCapability(ctx, "complaints.manage")
    const complaint = await ctx.db.get(complaintId)
    if (!complaint) throw new Error("Жалоба не найдена")
    if (complaint.status === "resolved") throw new Error("Жалоба уже рассмотрена")
    if (!isValidResolution(complaint.targetType, resolution as ComplaintResolution)) {
      throw new Error("Это действие недоступно для такой жалобы")
    }

    if (resolution === "blocked") {
      await requireCapability(ctx, "pages.block")
      const page = await ctx.db.get(complaint.pageId)
      if (page && page.status !== "blocked") {
        await ctx.db.patch(complaint.pageId, { status: "blocked", statusBeforeBlock: page.status })
        await logAction(ctx, { kind: "page", action: "block", targetId: complaint.pageId, pageId: complaint.pageId, actorId: admin.userId })
      }
    } else if (resolution === "hidden" && complaint.messageId) {
      await requireCapability(ctx, "guestbook.moderate")
      const message = await ctx.db.get(complaint.messageId)
      if (message && message.status !== "hidden") {
        await ctx.db.patch(complaint.messageId, {
          status: "hidden",
          approved: false,
          hiddenBy: "platform",
          hiddenReason: reason ?? "other",
          hiddenAt: Date.now(),
        })
        await logAction(ctx, { kind: "guestbook", action: "hide", targetId: complaint.messageId, pageId: complaint.pageId, actorId: admin.userId, reason })
      }
    } else if (resolution === "deleted" && complaint.messageId) {
      await requireCapability(ctx, "guestbook.delete")
      if (await ctx.db.get(complaint.messageId)) {
        await ctx.db.delete(complaint.messageId)
        await logAction(ctx, { kind: "guestbook", action: "delete", targetId: complaint.messageId, pageId: complaint.pageId, actorId: admin.userId, reason })
      }
    }
    // "warned": recorded below, nothing to deliver yet (no owner panel/notifications).
    // "dismissed": recorded below, no other action.

    await ctx.db.patch(complaintId, {
      status: "resolved",
      resolution,
      resolvedBy: admin.userId,
      resolvedAt: Date.now(),
    })
    await logAction(ctx, { kind: "content", action: "update", targetId: complaintId, pageId: complaint.pageId, actorId: admin.userId, reason: resolution })
    return null
  },
})
