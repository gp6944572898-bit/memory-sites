// Public reads of admin-managed content: epitaph templates, sticker catalog,
// and which page themes are currently offered. No auth required — this is
// what the page-creation flow and public pages show to any visitor.
import { v } from "convex/values"

import { query } from "./_generated/server"

const THEMES_KEY = "enabledThemes"
export const ALL_THEME_IDS = ["light", "dark"] as const
export type ThemeId = (typeof ALL_THEME_IDS)[number]

// Falls back to the phrases that used to be hard-coded, so the picker is
// never empty before an admin adds anything.
const DEFAULT_EPITAPHS = [
  "Вечная память",
  "Любим и помним",
  "Ты навсегда в наших сердцах",
  "Пусть земля будет пухом",
  "Светлая память",
  "Никогда не забудем",
]

export const listEpitaphTemplates = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("epitaphTemplates")
      .withIndex("by_order")
      .collect()
    const active = rows.filter((r) => r.active)
    return active.length > 0 ? active.map((r) => r.text) : DEFAULT_EPITAPHS
  },
})

export const listStickers = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("stickers"),
      name: v.string(),
      imageUrl: v.string(),
      priceRub: v.number(),
      category: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const rows = await ctx.db.query("stickers").withIndex("by_order").collect()
    return rows
      .filter((r) => r.active)
      .map((r) => ({
        _id: r._id,
        name: r.name,
        imageUrl: r.imageUrl,
        priceRub: r.priceRub,
        category: r.category,
      }))
  },
})

// Both themes are on until an admin turns one off.
export const getEnabledThemes = query({
  args: {},
  returns: v.array(v.union(v.literal("light"), v.literal("dark"))),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("platformSettings")
      .withIndex("by_key", (q) => q.eq("key", THEMES_KEY))
      .unique()
    if (!row) return [...ALL_THEME_IDS]
    const enabled = JSON.parse(row.value) as string[]
    const filtered = ALL_THEME_IDS.filter((id) => enabled.includes(id))
    // Never return an empty list: the create flow needs at least one theme.
    return filtered.length > 0 ? filtered : [...ALL_THEME_IDS]
  },
})

export { THEMES_KEY }
