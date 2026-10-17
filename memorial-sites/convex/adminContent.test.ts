// @vitest-environment node
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

async function setup() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const main = await ctx.db.insert("users", { email: "main@example.com" })
    const mod = await ctx.db.insert("users", { email: "mod@example.com" })
    const user = await ctx.db.insert("users", { email: "user@example.com" })
    await ctx.db.insert("adminRoles", { userId: main, role: "main_admin" })
    await ctx.db.insert("adminRoles", { userId: mod, role: "moderator" })
    return { main, mod, user }
  })
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|session` })
  return { t, asMain: as(ids.main), asMod: as(ids.mod), asUser: as(ids.user) }
}

const sticker = { name: "Роза", imageUrl: "https://cdn.example.com/rose.png", priceRub: 150, category: "Цветы" }

describe("stickers", () => {
  it("is closed to visitors, users and moderators", async () => {
    const { t, asUser, asMod } = await setup()
    for (const caller of [t, asUser, asMod]) {
      await expect(caller.mutation(api.adminContent.createSticker, sticker)).rejects.toThrow()
      await expect(caller.query(api.adminContent.listStickers, {})).rejects.toThrow()
    }
  })

  it("creates, edits, reorders and deletes, keeping the catalog in creation order by default", async () => {
    const { asMain } = await setup()
    const a = await asMain.mutation(api.adminContent.createSticker, sticker)
    const b = await asMain.mutation(api.adminContent.createSticker, { ...sticker, name: "Свеча", category: "Свечи" })

    let list = await asMain.query(api.adminContent.listStickers, {})
    expect(list.map((s) => s.name)).toEqual(["Роза", "Свеча"])
    expect(list[0]).toMatchObject({ active: true, priceRub: 150 })

    await asMain.mutation(api.adminContent.updateSticker, { stickerId: a, priceRub: 199.6, active: false })
    list = await asMain.query(api.adminContent.listStickers, {})
    expect(list.find((s) => s._id === a)).toMatchObject({ priceRub: 200, active: false })

    await asMain.mutation(api.adminContent.reorderSticker, { stickerId: b, direction: "up" })
    list = await asMain.query(api.adminContent.listStickers, {})
    expect(list.map((s) => s.name)).toEqual(["Свеча", "Роза"])

    await asMain.mutation(api.adminContent.deleteSticker, { stickerId: a })
    list = await asMain.query(api.adminContent.listStickers, {})
    expect(list.map((s) => s.name)).toEqual(["Свеча"])
  })

  it("validates name, category and price", async () => {
    const { asMain } = await setup()
    await expect(asMain.mutation(api.adminContent.createSticker, { ...sticker, name: "  " })).rejects.toThrow()
    await expect(asMain.mutation(api.adminContent.createSticker, { ...sticker, category: "" })).rejects.toThrow()
    await expect(asMain.mutation(api.adminContent.createSticker, { ...sticker, priceRub: -1 })).rejects.toThrow()
    await expect(asMain.mutation(api.adminContent.createSticker, { ...sticker, name: "я".repeat(81) })).rejects.toThrow()
  })

  it("writes to the audit log without exposing which admin did it publicly", async () => {
    const { t, asMain } = await setup()
    const id = await asMain.mutation(api.adminContent.createSticker, sticker)
    await asMain.mutation(api.adminContent.deleteSticker, { stickerId: id })
    const log = await t.run((ctx) => ctx.db.query("moderationLog").collect())
    expect(log.map((l) => l.action)).toEqual(["create", "delete"])
    expect(log.every((l) => l.kind === "content")).toBe(true)
  })

  it("only shows active stickers to visitors, ordered", async () => {
    const { t, asMain } = await setup()
    const a = await asMain.mutation(api.adminContent.createSticker, sticker)
    await asMain.mutation(api.adminContent.createSticker, { ...sticker, name: "Свеча", category: "Свечи" })
    await asMain.mutation(api.adminContent.updateSticker, { stickerId: a, active: false })

    const pub = await t.query(api.content.listStickers, {})
    expect(pub.map((s) => s.name)).toEqual(["Свеча"])
    expect(pub[0]).not.toHaveProperty("active")
    expect(pub[0]).not.toHaveProperty("order")
  })
})

describe("epitaph templates", () => {
  it("falls back to the built-in phrases until an admin adds any", async () => {
    const { t } = await setup()
    const list = await t.query(api.content.listEpitaphTemplates, {})
    expect(list).toContain("Вечная память")
    expect(list.length).toBeGreaterThan(0)
  })

  it("switches to the admin's list once one is active, hiding inactive ones", async () => {
    const { t, asMain } = await setup()
    const id = await asMain.mutation(api.adminContent.createEpitaphTemplate, { text: "Скорбим вместе" })
    await asMain.mutation(api.adminContent.createEpitaphTemplate, { text: "Останешься в сердце" })
    const hidden = await asMain.mutation(api.adminContent.createEpitaphTemplate, { text: "черновик" })
    await asMain.mutation(api.adminContent.updateEpitaphTemplate, { templateId: hidden, active: false })

    const pub = await t.query(api.content.listEpitaphTemplates, {})
    expect(pub).toEqual(["Скорбим вместе", "Останешься в сердце"])

    await asMain.mutation(api.adminContent.reorderEpitaphTemplate, { templateId: id, direction: "down" })
    expect(await t.query(api.content.listEpitaphTemplates, {})).toEqual(["Останешься в сердце", "Скорбим вместе"])
  })

  it("validates and allows editing text", async () => {
    const { asMain } = await setup()
    await expect(asMain.mutation(api.adminContent.createEpitaphTemplate, { text: "  " })).rejects.toThrow()
    await expect(asMain.mutation(api.adminContent.createEpitaphTemplate, { text: "я".repeat(201) })).rejects.toThrow()
    const id = await asMain.mutation(api.adminContent.createEpitaphTemplate, { text: "Изначально" })
    await asMain.mutation(api.adminContent.updateEpitaphTemplate, { templateId: id, text: "Исправлено" })
    const list = await asMain.query(api.adminContent.listEpitaphTemplates, {})
    expect(list.find((t) => t._id === id)?.text).toBe("Исправлено")
  })

  it("is closed to visitors, users and moderators", async () => {
    const { t, asUser, asMod } = await setup()
    for (const caller of [t, asUser, asMod]) {
      await expect(caller.mutation(api.adminContent.createEpitaphTemplate, { text: "x" })).rejects.toThrow()
    }
  })
})

describe("themes", () => {
  it("both themes are enabled by default", async () => {
    const { t } = await setup()
    expect(await t.query(api.content.getEnabledThemes, {})).toEqual(["light", "dark"])
  })

  it("lets the main admin turn one off, and never both", async () => {
    const { t, asMain } = await setup()
    await asMain.mutation(api.adminContent.setThemeEnabled, { theme: "dark", enabled: false })
    expect(await t.query(api.content.getEnabledThemes, {})).toEqual(["light"])
    const settings = await asMain.query(api.adminContent.getThemeSettings, {})
    expect(settings).toEqual([
      { id: "light", enabled: true },
      { id: "dark", enabled: false },
    ])

    await expect(
      asMain.mutation(api.adminContent.setThemeEnabled, { theme: "light", enabled: false }),
    ).rejects.toThrow("хотя бы одна")

    await asMain.mutation(api.adminContent.setThemeEnabled, { theme: "dark", enabled: true })
    expect(await t.query(api.content.getEnabledThemes, {})).toEqual(["light", "dark"])
  })

  it("is closed to visitors, users and moderators", async () => {
    const { t, asUser, asMod } = await setup()
    for (const caller of [t, asUser, asMod]) {
      await expect(
        caller.mutation(api.adminContent.setThemeEnabled, { theme: "dark", enabled: false }),
      ).rejects.toThrow()
    }
  })
})
