import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"

import type { Id } from "./_generated/dataModel"
import { mutation, query, type MutationCtx } from "./_generated/server"
import {
  detectHold,
  initialStatus,
  MAX_MESSAGES_PER_HOUR,
  MAX_NAME_LENGTH,
  MAX_TEXT_LENGTH,
  type MessageStatus,
} from "./guestbookRules"

const messageValidator = v.object({
  _id: v.id("guestbookMessages"),
  _creationTime: v.number(),
  pageId: v.id("pages"),
  authorName: v.string(),
  text: v.string(),
  approved: v.boolean(),
})

type NewMessage = {
  pageId: Id<"pages">
  authorName: string
  text: string
  deviceKey?: string
}

async function createMessage(
  ctx: MutationCtx,
  args: NewMessage,
): Promise<{ id: Id<"guestbookMessages">; status: MessageStatus }> {
  const text = args.text.trim()
  const authorName = args.authorName.trim()
  if (!text) throw new Error("Message text is required")
  if (!authorName) throw new Error("Name is required")
  if (authorName.length > MAX_NAME_LENGTH) {
    throw new Error(`Имя не длиннее ${MAX_NAME_LENGTH} символов`)
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw new Error(`Сообщение не длиннее ${MAX_TEXT_LENGTH} символов`)
  }

  const page = await ctx.db.get(args.pageId)
  if (!page) throw new Error("Page not found")
  if (page.status === "blocked") throw new Error("Страница недоступна")

  const deviceKey = args.deviceKey?.trim().slice(0, 100) || undefined
  if (deviceKey) {
    const since = Date.now() - 3_600_000
    const recent = await ctx.db
      .query("guestbookMessages")
      .withIndex("by_device", (q) =>
        q.eq("deviceKey", deviceKey).gte("_creationTime", since),
      )
      .take(MAX_MESSAGES_PER_HOUR)
    if (recent.length >= MAX_MESSAGES_PER_HOUR) {
      throw new Error("Слишком много сообщений. Попробуйте чуть позже")
    }
  }

  const held = detectHold(text)
  const status = initialStatus({
    platformModeration: page.platformModeration === true,
    requireApproval: page.requireApproval,
    held,
  })
  const id = await ctx.db.insert("guestbookMessages", {
    pageId: args.pageId,
    authorName,
    text,
    approved: status === "published",
    status,
    heldReason: held ?? undefined,
    deviceKey,
  })
  return { id, status }
}

// Kept as it was so existing clients keep working.
export const add = mutation({
  args: {
    pageId: v.id("pages"),
    authorName: v.string(),
    text: v.string(),
  },
  returns: v.id("guestbookMessages"),
  handler: async (ctx, args) => {
    const { id } = await createMessage(ctx, args)
    return id
  },
})

// Same as `add`, but tells the visitor what happened to the message, so the
// page can say "sent to moderation". `deviceKey` is an anonymous per-browser
// token used only to limit how fast one browser can post.
export const submit = mutation({
  args: {
    pageId: v.id("pages"),
    authorName: v.string(),
    text: v.string(),
    deviceKey: v.optional(v.string()),
  },
  returns: v.object({
    id: v.id("guestbookMessages"),
    status: v.union(
      v.literal("pending_platform"),
      v.literal("pending_owner"),
      v.literal("published"),
    ),
  }),
  handler: async (ctx, args) => {
    const { id, status } = await createMessage(ctx, args)
    // A freshly created message is never "hidden".
    return { id, status: status === "hidden" ? "pending_platform" : status }
  },
})

export const list = query({
  args: { pageId: v.id("pages"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(messageValidator),
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId)
    if (!page || page.status === "blocked") {
      return { page: [], isDone: true, continueCursor: "" }
    }
    const result = await ctx.db
      .query("guestbookMessages")
      .withIndex("by_page", (q) => q.eq("pageId", args.pageId))
      .filter((q) => q.eq(q.field("approved"), true))
      .order("desc")
      .paginate(args.paginationOpts)
    // Moderation fields never leave the backend.
    return {
      ...result,
      page: result.page.map((m) => ({
        _id: m._id,
        _creationTime: m._creationTime,
        pageId: m.pageId,
        authorName: m.authorName,
        text: m.text,
        approved: m.approved,
      })),
    }
  },
})
