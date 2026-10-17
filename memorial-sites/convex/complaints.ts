// Public complaint submission: any visitor can report a page or a guestbook
// message, no sign-in required.
import { v } from "convex/values"

import { mutation } from "./_generated/server"
import {
  COMPLAINT_REASONS,
  MAX_COMPLAINTS_PER_HOUR,
  MAX_CONTACT_LENGTH,
  MAX_DETAILS_LENGTH,
} from "./complaintsRules"

const reasonValidator = v.union(
  v.literal("spam"),
  v.literal("insult"),
  v.literal("personal_data"),
  v.literal("illegal"),
  v.literal("fake_info"),
  v.literal("other"),
)

export const submit = mutation({
  args: {
    targetType: v.union(v.literal("page"), v.literal("message")),
    pageId: v.optional(v.id("pages")),
    messageId: v.optional(v.id("guestbookMessages")),
    reason: reasonValidator,
    details: v.optional(v.string()),
    contact: v.optional(v.string()),
    deviceKey: v.optional(v.string()),
  },
  returns: v.id("complaints"),
  handler: async (ctx, args) => {
    if (!COMPLAINT_REASONS.includes(args.reason)) throw new Error("Некорректная причина")

    const details = args.details?.trim() || undefined
    if (details && details.length > MAX_DETAILS_LENGTH) {
      throw new Error(`Комментарий не длиннее ${MAX_DETAILS_LENGTH} символов`)
    }
    const contact = args.contact?.trim() || undefined
    if (contact && contact.length > MAX_CONTACT_LENGTH) {
      throw new Error(`Контакт не длиннее ${MAX_CONTACT_LENGTH} символов`)
    }

    let pageId = args.pageId
    let messageId: typeof args.messageId
    if (args.targetType === "message") {
      if (!args.messageId) throw new Error("Не указано сообщение")
      const message = await ctx.db.get(args.messageId)
      if (!message) throw new Error("Сообщение не найдено")
      messageId = args.messageId
      pageId = message.pageId // always the message's own page, never trust the client here
    } else {
      if (!args.pageId) throw new Error("Не указана страница")
      if (!(await ctx.db.get(args.pageId))) throw new Error("Страница не найдена")
      pageId = args.pageId
    }

    const deviceKey = args.deviceKey?.trim().slice(0, 100) || undefined
    if (deviceKey) {
      const since = Date.now() - 3_600_000
      const recent = await ctx.db
        .query("complaints")
        .withIndex("by_device", (q) => q.eq("deviceKey", deviceKey).gte("_creationTime", since))
        .take(MAX_COMPLAINTS_PER_HOUR)
      if (recent.length >= MAX_COMPLAINTS_PER_HOUR) {
        throw new Error("Слишком много жалоб. Попробуйте чуть позже")
      }
    }

    const complaintId = await ctx.db.insert("complaints", {
      targetType: args.targetType,
      pageId: pageId!,
      messageId,
      reason: args.reason,
      details,
      contact,
      deviceKey,
      status: "open",
    })

    // So an open complaint keeps the message out of the 90-day auto-purge.
    if (messageId) {
      await ctx.db.patch(messageId, { complaintId })
    }

    return complaintId
  },
})
