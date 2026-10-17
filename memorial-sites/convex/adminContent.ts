// Admin management of stickers, epitaph templates, and which page themes are
// offered. All behind `platform.settings` (main admin only).
import { v } from "convex/values"

import { logAction } from "./auditLog"
import { ALL_THEME_IDS, THEMES_KEY } from "./content"
import { mutation, query } from "./_generated/server"
import { requireCapability } from "./permissions"

const MAX_NAME = 80
const MAX_CATEGORY = 40
const MAX_EPITAPH = 200

// ---- stickers ---------------------------------------------------------

export const listStickers = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("stickers"),
      _creationTime: v.number(),
      name: v.string(),
      imageUrl: v.string(),
      priceRub: v.number(),
      category: v.string(),
      active: v.boolean(),
      order: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireCapability(ctx, "platform.settings")
    return await ctx.db.query("stickers").withIndex("by_order").collect()
  },
})

function cleanStickerFields(args: {
  name: string
  category: string
  priceRub: number
}) {
  const name = args.name.trim()
  const category = args.category.trim()
  if (!name) throw new Error("Название обязательно")
  if (name.length > MAX_NAME) throw new Error(`Название не длиннее ${MAX_NAME} символов`)
  if (!category) throw new Error("Категория обязательна")
  if (category.length > MAX_CATEGORY) {
    throw new Error(`Категория не длиннее ${MAX_CATEGORY} символов`)
  }
  if (!Number.isFinite(args.priceRub) || args.priceRub < 0) {
    throw new Error("Некорректная цена")
  }
  return { name, category }
}

export const createSticker = mutation({
  args: {
    name: v.string(),
    imageUrl: v.string(),
    priceRub: v.number(),
    category: v.string(),
  },
  returns: v.id("stickers"),
  handler: async (ctx, args) => {
    const admin = await requireCapability(ctx, "platform.settings")
    const { name, category } = cleanStickerFields(args)
    const last = await ctx.db.query("stickers").withIndex("by_order").order("desc").first()
    const id = await ctx.db.insert("stickers", {
      name,
      imageUrl: args.imageUrl,
      priceRub: Math.round(args.priceRub),
      category,
      active: true,
      order: (last?.order ?? 0) + 1,
    })
    await logAction(ctx, { kind: "content", action: "create", targetId: id, actorId: admin.userId })
    return id
  },
})

export const updateSticker = mutation({
  args: {
    stickerId: v.id("stickers"),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    priceRub: v.optional(v.number()),
    category: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireCapability(ctx, "platform.settings")
    const sticker = await ctx.db.get(args.stickerId)
    if (!sticker) throw new Error("Стикер не найден")

    const patch: Partial<{
      name: string
      imageUrl: string
      priceRub: number
      category: string
      active: boolean
    }> = {}
    if (args.name !== undefined || args.category !== undefined) {
      const cleaned = cleanStickerFields({
        name: args.name ?? sticker.name,
        category: args.category ?? sticker.category,
        priceRub: args.priceRub ?? sticker.priceRub,
      })
      if (args.name !== undefined) patch.name = cleaned.name
      if (args.category !== undefined) patch.category = cleaned.category
    }
    if (args.priceRub !== undefined) {
      if (!Number.isFinite(args.priceRub) || args.priceRub < 0) {
        throw new Error("Некорректная цена")
      }
      patch.priceRub = Math.round(args.priceRub)
    }
    if (args.imageUrl !== undefined) patch.imageUrl = args.imageUrl
    if (args.active !== undefined) patch.active = args.active

    await ctx.db.patch(args.stickerId, patch)
    await logAction(ctx, {
      kind: "content",
      action: "update",
      targetId: args.stickerId,
      actorId: admin.userId,
    })
    return null
  },
})

export const reorderSticker = mutation({
  args: { stickerId: v.id("stickers"), direction: v.union(v.literal("up"), v.literal("down")) },
  returns: v.null(),
  handler: async (ctx, { stickerId, direction }) => {
    await requireCapability(ctx, "platform.settings")
    const all = await ctx.db.query("stickers").withIndex("by_order").collect()
    const index = all.findIndex((s) => s._id === stickerId)
    if (index === -1) throw new Error("Стикер не найден")
    const swapWith = direction === "up" ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= all.length) return null
    const a = all[index]
    const b = all[swapWith]
    await ctx.db.patch(a._id, { order: b.order })
    await ctx.db.patch(b._id, { order: a.order })
    return null
  },
})

export const deleteSticker = mutation({
  args: { stickerId: v.id("stickers") },
  returns: v.null(),
  handler: async (ctx, { stickerId }) => {
    const admin = await requireCapability(ctx, "platform.settings")
    if (!(await ctx.db.get(stickerId))) throw new Error("Стикер не найден")
    await ctx.db.delete(stickerId)
    await logAction(ctx, { kind: "content", action: "delete", targetId: stickerId, actorId: admin.userId })
    return null
  },
})

// ---- epitaph templates --------------------------------------------------

export const listEpitaphTemplates = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("epitaphTemplates"),
      _creationTime: v.number(),
      text: v.string(),
      active: v.boolean(),
      order: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireCapability(ctx, "platform.settings")
    return await ctx.db.query("epitaphTemplates").withIndex("by_order").collect()
  },
})

export const createEpitaphTemplate = mutation({
  args: { text: v.string() },
  returns: v.id("epitaphTemplates"),
  handler: async (ctx, { text }) => {
    const admin = await requireCapability(ctx, "platform.settings")
    const cleaned = text.trim()
    if (!cleaned) throw new Error("Текст обязателен")
    if (cleaned.length > MAX_EPITAPH) throw new Error(`Не длиннее ${MAX_EPITAPH} символов`)
    const last = await ctx.db.query("epitaphTemplates").withIndex("by_order").order("desc").first()
    const id = await ctx.db.insert("epitaphTemplates", {
      text: cleaned,
      active: true,
      order: (last?.order ?? 0) + 1,
    })
    await logAction(ctx, { kind: "content", action: "create", targetId: id, actorId: admin.userId })
    return id
  },
})

export const updateEpitaphTemplate = mutation({
  args: {
    templateId: v.id("epitaphTemplates"),
    text: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireCapability(ctx, "platform.settings")
    if (!(await ctx.db.get(args.templateId))) throw new Error("Шаблон не найден")
    const patch: Partial<{ text: string; active: boolean }> = {}
    if (args.text !== undefined) {
      const cleaned = args.text.trim()
      if (!cleaned) throw new Error("Текст обязателен")
      if (cleaned.length > MAX_EPITAPH) throw new Error(`Не длиннее ${MAX_EPITAPH} символов`)
      patch.text = cleaned
    }
    if (args.active !== undefined) patch.active = args.active
    await ctx.db.patch(args.templateId, patch)
    await logAction(ctx, {
      kind: "content",
      action: "update",
      targetId: args.templateId,
      actorId: admin.userId,
    })
    return null
  },
})

export const reorderEpitaphTemplate = mutation({
  args: { templateId: v.id("epitaphTemplates"), direction: v.union(v.literal("up"), v.literal("down")) },
  returns: v.null(),
  handler: async (ctx, { templateId, direction }) => {
    await requireCapability(ctx, "platform.settings")
    const all = await ctx.db.query("epitaphTemplates").withIndex("by_order").collect()
    const index = all.findIndex((t) => t._id === templateId)
    if (index === -1) throw new Error("Шаблон не найден")
    const swapWith = direction === "up" ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= all.length) return null
    const a = all[index]
    const b = all[swapWith]
    await ctx.db.patch(a._id, { order: b.order })
    await ctx.db.patch(b._id, { order: a.order })
    return null
  },
})

export const deleteEpitaphTemplate = mutation({
  args: { templateId: v.id("epitaphTemplates") },
  returns: v.null(),
  handler: async (ctx, { templateId }) => {
    const admin = await requireCapability(ctx, "platform.settings")
    if (!(await ctx.db.get(templateId))) throw new Error("Шаблон не найден")
    await ctx.db.delete(templateId)
    await logAction(ctx, { kind: "content", action: "delete", targetId: templateId, actorId: admin.userId })
    return null
  },
})

// ---- themes ---------------------------------------------------------------

export const getThemeSettings = query({
  args: {},
  returns: v.array(v.object({ id: v.union(v.literal("light"), v.literal("dark")), enabled: v.boolean() })),
  handler: async (ctx) => {
    await requireCapability(ctx, "platform.settings")
    const row = await ctx.db
      .query("platformSettings")
      .withIndex("by_key", (q) => q.eq("key", THEMES_KEY))
      .unique()
    const enabled: string[] = row ? JSON.parse(row.value) : [...ALL_THEME_IDS]
    return ALL_THEME_IDS.map((id) => ({ id, enabled: enabled.includes(id) }))
  },
})

export const setThemeEnabled = mutation({
  args: { theme: v.union(v.literal("light"), v.literal("dark")), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { theme, enabled }) => {
    const admin = await requireCapability(ctx, "platform.settings")
    const row = await ctx.db
      .query("platformSettings")
      .withIndex("by_key", (q) => q.eq("key", THEMES_KEY))
      .unique()
    const current = new Set<string>(row ? JSON.parse(row.value) : ALL_THEME_IDS)
    if (enabled) current.add(theme)
    else current.delete(theme)
    // At least one theme must stay available to visitors.
    if (current.size === 0) throw new Error("Должна остаться включена хотя бы одна тема")
    const value = JSON.stringify([...current])
    if (row) await ctx.db.patch(row._id, { value })
    else await ctx.db.insert("platformSettings", { key: THEMES_KEY, value })
    await logAction(ctx, { kind: "content", action: "update", targetId: theme, actorId: admin.userId })
    return null
  },
})
