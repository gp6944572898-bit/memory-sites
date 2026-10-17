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
    const user = await ctx.db.insert("users", { email: "user@example.com" })
    await ctx.db.insert("adminRoles", { userId: main, role: "main_admin" })
    await ctx.db.insert("adminRoles", { userId: mod, role: "moderator" })
    return { main, mod, user }
  })
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|session` })
  return { t, asMain: as(ids.main), asMod: as(ids.mod), asUser: as(ids.user) }
}

describe("dashboard", () => {
  it("rejects visitors and ordinary users", async () => {
    const { t, asUser } = await setup()
    await expect(t.query(api.adminDashboard.get, { periodDays: 30 })).rejects.toThrow()
    await expect(asUser.query(api.adminDashboard.get, { periodDays: 30 })).rejects.toThrow()
  })

  it("shows counts to moderators but hides money", async () => {
    const { t, asMod } = await setup()
    await t.mutation(api.pages.create, pageArgs)
    const stats = await asMod.query(api.adminDashboard.get, { periodDays: 30 })
    expect(stats.pages.total).toBe(1)
    expect(stats.pages.pendingPayment).toBe(1)
    expect(stats.campaigns.active).toBe(1)
    expect(stats.finance).toBeNull()
  })

  it("shows money to the main admin", async () => {
    const { t, asMain } = await setup()
    const { id } = await t.mutation(api.pages.create, pageArgs)
    const campaign = await t.query(api.campaigns.getByPage, { pageId: id })
    await t.mutation(api.campaigns.contribute, {
      campaignId: campaign!._id,
      amountRub: 700,
      anonymous: false,
    })
    const stats = await asMain.query(api.adminDashboard.get, { periodDays: 7 })
    expect(stats.finance).toEqual({
      capturedRub: 0,
      heldRub: 700,
      contributionsInPeriod: 1,
    })
  })

  it("counts blocked pages separately", async () => {
    const { t, asMod } = await setup()
    const { id } = await t.mutation(api.pages.create, pageArgs)
    await asMod.mutation(api.admin.setPageBlocked, { pageId: id, blocked: true })
    const stats = await asMod.query(api.adminDashboard.get, { periodDays: 0 })
    expect(stats.pages.blocked).toBe(1)
    expect(stats.pages.pendingPayment).toBe(0)
  })
})
