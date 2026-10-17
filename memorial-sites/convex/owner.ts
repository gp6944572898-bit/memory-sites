// Owner panel backend. Access is governed entirely by possessing the page's
// `ownerToken` (see ownerToken.ts and pages.create) — there is no sign-in
// requirement, since most creators never sign in at all. Whoever holds the
// token controls the page, the same trust model as a donor's personal
// cancel link elsewhere in this app.
import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { effectiveStatus, type MessageStatus } from "./guestbookRules"

const MAX_NAME = 120
const MAX_EPITAPH = 300
const MAX_BIO = 20_000
const MAX_EMAIL = 200

async function requireOwnerPage(
  ctx: { db: any },
  token: string,
) {
  const page = await ctx.db
    .query("pages")
    .withIndex("by_owner_token", (q: any) => q.eq("ownerToken", token))
    .unique()
  if (!page) throw new Error("Ссылка недействительна")
  return page
}

const pageValidator = v.object({
  _id: v.id("pages"),
  slug: v.string(),
  fullName: v.string(),
  birthDate: v.string(),
  deathDate: v.string(),
  epitaph: v.string(),
  bioText: v.string(),
  mainPhotoUrl: v.union(v.string(), v.null()),
  photoAlbumUrls: v.array(v.string()),
  videoUrl: v.union(v.string(), v.null()),
  burialLat: v.union(v.number(), v.null()),
  burialLng: v.union(v.number(), v.null()),
  status: v.union(
    v.literal("active"),
    v.literal("reduced"),
    v.literal("pending_payment"),
    v.literal("blocked"),
  ),
  requireApproval: v.boolean(),
  ownerEmail: v.union(v.string(), v.null()),
})

export const get = query({
  args: { token: v.string() },
  returns: v.union(v.null(), pageValidator),
  handler: async (ctx, { token }) => {
    const page = await ctx.db
      .query("pages")
      .withIndex("by_owner_token", (q) => q.eq("ownerToken", token))
      .unique()
    if (!page) return null
    return {
      _id: page._id,
      slug: page.slug,
      fullName: page.fullName,
      birthDate: page.birthDate,
      deathDate: page.deathDate,
      epitaph: page.epitaph,
      bioText: page.bioText,
      mainPhotoUrl: page.mainPhotoUrl ?? null,
      photoAlbumUrls: page.photoAlbumUrls ?? [],
      videoUrl: page.videoUrl ?? null,
      burialLat: page.burialLat ?? null,
      burialLng: page.burialLng ?? null,
      status: page.status,
      requireApproval: page.requireApproval,
      ownerEmail: page.ownerEmail ?? null,
    }
  },
})

export const updateContent = mutation({
  args: {
    token: v.string(),
    fullName: v.optional(v.string()),
    birthDate: v.optional(v.string()),
    deathDate: v.optional(v.string()),
    epitaph: v.optional(v.string()),
    bioText: v.optional(v.string()),
    mainPhotoUrl: v.optional(v.string()),
    photoAlbumUrls: v.optional(v.array(v.string())),
    videoUrl: v.optional(v.string()),
    burialLat: v.optional(v.number()),
    burialLng: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { token, ...fields }) => {
    const page = await requireOwnerPage(ctx, token)
    if (page.status === "blocked") {
      throw new Error("Страница заблокирована, редактирование недоступно")
    }

    const patch: Record<string, unknown> = {}
    if (fields.fullName !== undefined) {
      const name = fields.fullName.trim()
      if (!name) throw new Error("Имя обязательно")
      if (name.length > MAX_NAME) throw new Error(`Имя не длиннее ${MAX_NAME} символов`)
      patch.fullName = name
    }
    if (fields.birthDate !== undefined) patch.birthDate = fields.birthDate
    if (fields.deathDate !== undefined) patch.deathDate = fields.deathDate
    if (fields.epitaph !== undefined) {
      const epitaph = fields.epitaph.trim()
      if (epitaph.length > MAX_EPITAPH) throw new Error(`Эпитафия не длиннее ${MAX_EPITAPH} символов`)
      patch.epitaph = epitaph
    }
    if (fields.bioText !== undefined) {
      if (fields.bioText.length > MAX_BIO) throw new Error(`История не длиннее ${MAX_BIO} символов`)
      patch.bioText = fields.bioText
    }
    if (fields.mainPhotoUrl !== undefined) patch.mainPhotoUrl = fields.mainPhotoUrl
    if (fields.photoAlbumUrls !== undefined) patch.photoAlbumUrls = fields.photoAlbumUrls
    if (fields.videoUrl !== undefined) patch.videoUrl = fields.videoUrl
    if (fields.burialLat !== undefined) patch.burialLat = fields.burialLat
    if (fields.burialLng !== undefined) patch.burialLng = fields.burialLng

    await ctx.db.patch(page._id, patch)
    return null
  },
})

export const setRequireApproval = mutation({
  args: { token: v.string(), requireApproval: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { token, requireApproval }) => {
    const page = await requireOwnerPage(ctx, token)
    await ctx.db.patch(page._id, { requireApproval })
    return null
  },
})

// For the owner's own reference only (shown back to them) — not used for
// sign-in, and nothing is sent automatically yet: there is no general-purpose
// outbound-email sender configured in this project beyond the one-time
// sign-in code, which cannot carry a custom message like this link.
export const setOwnerEmail = mutation({
  args: { token: v.string(), email: v.string() },
  returns: v.null(),
  handler: async (ctx, { token, email }) => {
    const page = await requireOwnerPage(ctx, token)
    const trimmed = email.trim().toLowerCase()
    if (trimmed.length > MAX_EMAIL) throw new Error("Слишком длинный адрес")
    if (trimmed && !trimmed.includes("@")) throw new Error("Некорректная почта")
    await ctx.db.patch(page._id, { ownerEmail: trimmed || undefined })
    return null
  },
})

// ---- guestbook moderation --------------------------------------------------
//
// The owner's own slice of moderation: approve what is waiting on them, hide
// or restore messages on their page. Platform-side holds (links/phone, or a
// platform-set review) are not theirs to approve — only guestbook.moderate
// (admin/moderator) can act on those, same as the admin queue already does.

const messageRowValidator = v.object({
  _id: v.id("guestbookMessages"),
  authorName: v.string(),
  text: v.string(),
  status: v.union(
    v.literal("pending_platform"),
    v.literal("pending_owner"),
    v.literal("published"),
    v.literal("hidden"),
  ),
  hiddenBy: v.union(v.literal("owner"), v.literal("platform"), v.null()),
  createdAt: v.number(),
})

export const listMessages = query({
  args: { token: v.string() },
  returns: v.array(messageRowValidator),
  handler: async (ctx, { token }) => {
    const page = await requireOwnerPage(ctx, token)
    const messages = await ctx.db
      .query("guestbookMessages")
      .withIndex("by_page", (q) => q.eq("pageId", page._id))
      .order("desc")
      .collect()
    return messages.map((m) => ({
      _id: m._id,
      authorName: m.authorName,
      text: m.text,
      status: effectiveStatus(m) as MessageStatus,
      hiddenBy: m.hiddenBy ?? null,
      createdAt: m._creationTime,
    }))
  },
})

async function requireOwnMessage(
  ctx: { db: any },
  token: string,
  messageId: any,
) {
  const page = await requireOwnerPage(ctx, token)
  const message = await ctx.db.get(messageId)
  if (!message || message.pageId !== page._id) {
    throw new Error("Сообщение не найдено")
  }
  return message
}

export const approveMessage = mutation({
  args: { token: v.string(), messageId: v.id("guestbookMessages") },
  returns: v.null(),
  handler: async (ctx, { token, messageId }) => {
    const message = await requireOwnMessage(ctx, token, messageId)
    if (effectiveStatus(message) !== "pending_owner") {
      throw new Error("Сообщение не ожидает вашей проверки")
    }
    await ctx.db.patch(messageId, { status: "published", approved: true })
    return null
  },
})

export const hideMessage = mutation({
  args: { token: v.string(), messageId: v.id("guestbookMessages") },
  returns: v.null(),
  handler: async (ctx, { token, messageId }) => {
    const message = await requireOwnMessage(ctx, token, messageId)
    if (effectiveStatus(message) === "hidden") return null
    await ctx.db.patch(messageId, {
      status: "hidden",
      approved: false,
      hiddenBy: "owner",
      hiddenAt: Date.now(),
    })
    return null
  },
})

// Owners can only undo their own hides — what the platform hid stays hidden
// until a moderator says otherwise, same rule as the admin side.
export const restoreMessage = mutation({
  args: { token: v.string(), messageId: v.id("guestbookMessages") },
  returns: v.null(),
  handler: async (ctx, { token, messageId }) => {
    const message = await requireOwnMessage(ctx, token, messageId)
    if (effectiveStatus(message) !== "hidden" || message.hiddenBy !== "owner") {
      throw new Error("Вернуть можно только сообщение, скрытое вами")
    }
    await ctx.db.patch(messageId, {
      status: "published",
      approved: true,
      hiddenBy: undefined,
      hiddenReason: undefined,
      hiddenAt: undefined,
    })
    return null
  },
})
