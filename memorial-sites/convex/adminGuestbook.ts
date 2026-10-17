// Memory-book moderation for the admin panels.
//
// Flow of a new message: platform moderation (if the owner asked for it, or
// the text has a link / phone number) -> the owner's own review (if on) ->
// published. Admins see EVERY pending message, whichever step it waits at.
// Hidden messages are kept for HIDDEN_RETENTION_DAYS and then purged, unless
// a complaint references them. Every action is written to moderationLog
// (without the message text).
import { v, type Infer } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server"
import {
  effectiveStatus,
  HIDDEN_RETENTION_DAYS,
  isOverdue,
  statusAfterPlatformApproval,
  type MessageStatus,
} from "./guestbookRules"
import { logAction as writeLog } from "./auditLog"
import { requireCapability } from "./permissions"

const MAX_ROWS = 200

const reasonValidator = v.union(
  v.literal("spam"),
  v.literal("insult"),
  v.literal("personal_data"),
  v.literal("illegal"),
  v.literal("other"),
)

const statusValidator = v.union(
  v.literal("pending_platform"),
  v.literal("pending_owner"),
  v.literal("published"),
  v.literal("hidden"),
)

const rowValidator = v.object({
  _id: v.id("guestbookMessages"),
  pageId: v.id("pages"),
  pageName: v.string(),
  pageSlug: v.string(),
  authorName: v.string(),
  text: v.string(),
  status: statusValidator,
  heldReason: v.union(v.literal("link"), v.literal("phone"), v.null()),
  hiddenBy: v.union(v.literal("owner"), v.literal("platform"), v.null()),
  hiddenReason: v.union(v.string(), v.null()),
  hiddenAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  overdue: v.boolean(),
})

export const list = query({
  args: {
    tab: v.union(v.literal("queue"), v.literal("hidden"), v.literal("all")),
    search: v.optional(v.string()),
  },
  returns: v.object({ rows: v.array(rowValidator), truncated: v.boolean() }),
  handler: async (ctx, { tab, search }) => {
    await requireCapability(ctx, "guestbook.moderate")

    let messages: Doc<"guestbookMessages">[]
    if (tab === "queue") {
      // Old messages have no status yet: include them via the "missing" slot.
      const [platform, owner, legacy] = await Promise.all([
        ctx.db
          .query("guestbookMessages")
          .withIndex("by_status", (q) => q.eq("status", "pending_platform"))
          .take(MAX_ROWS),
        ctx.db
          .query("guestbookMessages")
          .withIndex("by_status", (q) => q.eq("status", "pending_owner"))
          .take(MAX_ROWS),
        ctx.db
          .query("guestbookMessages")
          .withIndex("by_status", (q) => q.eq("status", undefined))
          .take(MAX_ROWS),
      ])
      messages = [...platform, ...owner, ...legacy]
        .filter((m) => {
          const s = effectiveStatus(m)
          return s === "pending_platform" || s === "pending_owner"
        })
        .sort((a, b) => a._creationTime - b._creationTime) // oldest first
    } else if (tab === "hidden") {
      messages = await ctx.db
        .query("guestbookMessages")
        .withIndex("by_status", (q) => q.eq("status", "hidden"))
        .order("desc")
        .take(MAX_ROWS)
    } else {
      messages = await ctx.db
        .query("guestbookMessages")
        .order("desc")
        .take(MAX_ROWS)
    }

    const needle = search?.trim().toLowerCase()
    const now = Date.now()
    const pages = new Map<string, { name: string; slug: string }>()
    const rows: Array<Infer<typeof rowValidator>> = []
    for (const m of messages) {
      if (
        needle &&
        !m.text.toLowerCase().includes(needle) &&
        !m.authorName.toLowerCase().includes(needle)
      ) {
        continue
      }
      let page = pages.get(m.pageId)
      if (!page) {
        const doc = await ctx.db.get(m.pageId)
        page = { name: doc?.fullName ?? "—", slug: doc?.slug ?? "" }
        pages.set(m.pageId, page)
      }
      const status: MessageStatus = effectiveStatus(m)
      rows.push({
        _id: m._id,
        pageId: m.pageId,
        pageName: page.name,
        pageSlug: page.slug,
        authorName: m.authorName,
        text: m.text,
        status,
        heldReason: m.heldReason ?? null,
        hiddenBy: m.hiddenBy ?? null,
        hiddenReason: m.hiddenReason ?? null,
        hiddenAt: m.hiddenAt ?? null,
        createdAt: m._creationTime,
        overdue: status === "pending_owner" && isOverdue(m._creationTime, now),
      })
    }
    return { rows, truncated: messages.length >= MAX_ROWS }
  },
})

export const approve = mutation({
  args: { messageId: v.id("guestbookMessages") },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const admin = await requireCapability(ctx, "guestbook.moderate")
    const message = await ctx.db.get(messageId)
    if (!message) throw new Error("Сообщение не найдено")
    const status = effectiveStatus(message)
    if (status !== "pending_platform" && status !== "pending_owner") {
      throw new Error("Сообщение не ожидает проверки")
    }
    const page = await ctx.db.get(message.pageId)
    const next: MessageStatus =
      status === "pending_platform"
        ? statusAfterPlatformApproval(page?.requireApproval === true)
        : "published"
    await ctx.db.patch(messageId, {
      status: next,
      approved: next === "published",
    })
    await writeLog(ctx, {
      kind: "guestbook",
      action: "approve",
      targetId: messageId,
      pageId: message.pageId,
      actorId: admin.userId,
    })
    return null
  },
})

export const hide = mutation({
  args: { messageId: v.id("guestbookMessages"), reason: reasonValidator },
  returns: v.null(),
  handler: async (ctx, { messageId, reason }) => {
    const admin = await requireCapability(ctx, "guestbook.moderate")
    const message = await ctx.db.get(messageId)
    if (!message) throw new Error("Сообщение не найдено")
    if (effectiveStatus(message) === "hidden") return null
    await ctx.db.patch(messageId, {
      status: "hidden",
      approved: false,
      hiddenBy: "platform",
      hiddenReason: reason,
      hiddenAt: Date.now(),
    })
    await writeLog(ctx, {
      kind: "guestbook",
      action: "hide",
      targetId: messageId,
      pageId: message.pageId,
      actorId: admin.userId,
      reason,
    })
    return null
  },
})

// Undo a hide made by the platform. Messages hidden by the page owner are the
// owner's call and stay hidden.
export const restore = mutation({
  args: { messageId: v.id("guestbookMessages") },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const admin = await requireCapability(ctx, "guestbook.moderate")
    const message = await ctx.db.get(messageId)
    if (!message) throw new Error("Сообщение не найдено")
    if (effectiveStatus(message) !== "hidden" || message.hiddenBy !== "platform") {
      throw new Error("Вернуть можно только сообщение, скрытое платформой")
    }
    await ctx.db.patch(messageId, {
      status: "published",
      approved: true,
      hiddenBy: undefined,
      hiddenReason: undefined,
      hiddenAt: undefined,
    })
    await writeLog(ctx, {
      kind: "guestbook",
      action: "restore",
      targetId: messageId,
      pageId: message.pageId,
      actorId: admin.userId,
    })
    return null
  },
})

// Deletes the message for good. Only the log entry (who, when, why — never the
// text) stays.
export const remove = mutation({
  args: { messageId: v.id("guestbookMessages"), reason: reasonValidator },
  returns: v.null(),
  handler: async (ctx, { messageId, reason }) => {
    const admin = await requireCapability(ctx, "guestbook.delete")
    const message = await ctx.db.get(messageId)
    if (!message) throw new Error("Сообщение не найдено")
    await ctx.db.delete(messageId)
    await writeLog(ctx, {
      kind: "guestbook",
      action: "delete",
      targetId: messageId,
      pageId: message.pageId,
      actorId: admin.userId,
      reason,
    })
    return null
  },
})

// Daily clean-up: hidden messages older than the retention period disappear,
// except those a complaint references.
export const purgeExpiredHidden = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - HIDDEN_RETENTION_DAYS * 86_400_000
    const hidden = await ctx.db
      .query("guestbookMessages")
      .withIndex("by_status", (q) => q.eq("status", "hidden"))
      .take(500)
    let purged = 0
    for (const m of hidden) {
      if (m.complaintId || m.hiddenAt === undefined || m.hiddenAt >= cutoff) continue
      await ctx.db.delete(m._id)
      await writeLog(ctx, {
        kind: "guestbook",
        action: "auto_purge",
        targetId: m._id,
        pageId: m.pageId,
      })
      purged++
    }
    return purged
  },
})

// One-off: give messages written before statuses existed a status.
export const backfillStatuses = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const old = await ctx.db
      .query("guestbookMessages")
      .withIndex("by_status", (q) => q.eq("status", undefined))
      .take(1000)
    for (const m of old) {
      await ctx.db.patch(m._id, { status: effectiveStatus(m) })
    }
    return old.length
  },
})
