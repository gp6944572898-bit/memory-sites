// @vitest-environment node
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = import.meta.glob("./**/*.ts")

const pageArgs = {
  fullName: "Иван Иванов",
  birthDate: "1950-01-01",
  deathDate: "2020-01-01",
  epitaph: "Помним",
  bioText: "Жил и работал",
}

async function setup() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const main = await ctx.db.insert("users", { email: "main@example.com" })
    const mod = await ctx.db.insert("users", { email: "mod@example.com" })
    const owner = await ctx.db.insert("users", { email: "owner@example.com" })
    await ctx.db.insert("adminRoles", { userId: main, role: "main_admin" })
    await ctx.db.insert("adminRoles", { userId: mod, role: "moderator" })
    return { main, mod, owner }
  })
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|session` })
  return { t, asMain: as(ids.main), asMod: as(ids.mod), asOwner: as(ids.owner) }
}

describe("adminPages.list", () => {
  it("is closed to visitors and ordinary users", async () => {
    const { t, asOwner } = await setup()
    await expect(t.query(api.adminPages.list, {})).rejects.toThrow()
    await expect(asOwner.query(api.adminPages.list, {})).rejects.toThrow()
  })

  it("shows owner e-mails to the main admin only", async () => {
    const { asMain, asMod, asOwner } = await setup()
    await asOwner.mutation(api.pages.create, pageArgs)

    const forMain = await asMain.query(api.adminPages.list, {})
    expect(forMain.rows).toHaveLength(1)
    expect(forMain.rows[0].ownerEmail).toBe("owner@example.com")
    expect(forMain.rows[0].campaign?.goalRub).toBe(8900)

    const forMod = await asMod.query(api.adminPages.list, {})
    expect(forMod.rows).toHaveLength(1)
    expect(forMod.rows[0].ownerEmail).toBeNull()
  })

  it("filters by status, including blocked pages, and by search", async () => {
    const { t, asMod } = await setup()
    const a = await t.mutation(api.pages.create, pageArgs)
    await t.mutation(api.pages.create, { ...pageArgs, fullName: "Пётр Петров" })
    await asMod.mutation(api.admin.setPageBlocked, { pageId: a.id, blocked: true })

    const blocked = await asMod.query(api.adminPages.list, { status: "blocked" })
    expect(blocked.rows.map((r) => r.fullName)).toEqual(["Иван Иванов"])

    const pending = await asMod.query(api.adminPages.list, { status: "pending_payment" })
    expect(pending.rows.map((r) => r.fullName)).toEqual(["Пётр Петров"])

    const search = await asMod.query(api.adminPages.list, { search: "  пётр " })
    expect(search.rows).toHaveLength(1)
    expect(search.rows[0].fullName).toBe("Пётр Петров")

    const all = await asMod.query(api.adminPages.list, {})
    expect(all.rows).toHaveLength(2)
    expect(all.truncated).toBe(false)
  })
})

describe("adminPages.get", () => {
  it("returns full content of a blocked page to admins, nothing to others", async () => {
    const { t, asMod } = await setup()
    const { id } = await t.mutation(api.pages.create, pageArgs)
    await asMod.mutation(api.admin.setPageBlocked, { pageId: id, blocked: true })

    const page = await asMod.query(api.adminPages.get, { pageId: id })
    expect(page?.bioText).toBe("Жил и работал")
    expect(page?.status).toBe("blocked")
    expect(page).not.toHaveProperty("ownerId")

    await expect(t.query(api.adminPages.get, { pageId: id })).rejects.toThrow()
  })
})
