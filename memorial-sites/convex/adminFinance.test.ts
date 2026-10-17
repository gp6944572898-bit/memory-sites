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
  const { id: pageId } = await t.mutation(api.pages.create, pageArgs)
  const campaign = await t.query(api.campaigns.getByPage, { pageId })
  return { t, pageId, campaignId: campaign!._id, asMain: as(ids.main), asMod: as(ids.mod), asUser: as(ids.user) }
}

describe("listCampaigns", () => {
  it("is closed to visitors, users and moderators (finance is main-admin only)", async () => {
    const { t, asUser, asMod } = await setup()
    for (const caller of [t, asUser, asMod]) {
      await expect(caller.query(api.adminFinance.listCampaigns, {})).rejects.toThrow()
    }
  })

  it("lists the page's campaign with page name and filters by status/search", async () => {
    const { asMain, pageId } = await setup()
    const { rows } = await asMain.query(api.adminFinance.listCampaigns, {})
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      pageId,
      pageName: "Иван Иванов",
      goalRub: 8900,
      collectedRub: 0,
      status: "active",
    })

    expect((await asMain.query(api.adminFinance.listCampaigns, { status: "completed" })).rows).toHaveLength(0)
    expect((await asMain.query(api.adminFinance.listCampaigns, { search: "иванов" })).rows).toHaveLength(1)
    expect((await asMain.query(api.adminFinance.listCampaigns, { search: "нет такого" })).rows).toHaveLength(0)
  })
})

describe("getCampaign", () => {
  it("is closed to visitors, users and moderators", async () => {
    const { t, asUser, asMod, campaignId } = await setup()
    for (const caller of [t, asUser, asMod]) {
      await expect(caller.query(api.adminFinance.getCampaign, { campaignId })).rejects.toThrow()
    }
  })

  it("returns null for an unknown campaign", async () => {
    const { t, asMain, campaignId } = await setup()
    await t.run((ctx) => ctx.db.delete(campaignId))
    expect(await asMain.query(api.adminFinance.getCampaign, { campaignId })).toBeNull()
  })

  it("lists contributions newest first and hides the donor name when anonymous", async () => {
    const { t, asMain, campaignId } = await setup()
    await t.mutation(api.campaigns.contribute, {
      campaignId,
      amountRub: 500,
      donorName: "Пётр",
      anonymous: false,
      message: "Светлая память",
    })
    await t.mutation(api.campaigns.contribute, {
      campaignId,
      amountRub: 1000,
      donorName: "Мария",
      anonymous: true,
    })

    const result = await asMain.query(api.adminFinance.getCampaign, { campaignId })
    expect(result?.contributions.map((c) => c.amountRub)).toEqual([1000, 500])
    const anon = result?.contributions.find((c) => c.amountRub === 1000)
    expect(anon).toMatchObject({ anonymous: true, donorName: null, status: "held" })
    const named = result?.contributions.find((c) => c.amountRub === 500)
    expect(named).toMatchObject({ anonymous: false, donorName: "Пётр", message: "Светлая память" })
  })
})

describe("manual cancellation stays the existing finance.manage action", () => {
  it("updates totals and is reflected in getCampaign", async () => {
    const { t, asMain, asMod, campaignId } = await setup()
    const { contributionId } = await t.mutation(api.campaigns.contribute, {
      campaignId,
      amountRub: 700,
      anonymous: false,
    })
    await expect(
      asMod.mutation(api.campaigns.adminCancelContribution, { contributionId }),
    ).rejects.toThrow()

    await asMain.mutation(api.campaigns.adminCancelContribution, { contributionId })
    const result = await asMain.query(api.adminFinance.getCampaign, { campaignId })
    expect(result?.campaign.collectedRub).toBe(0)
    expect(result?.contributions[0].status).toBe("cancelled")
  })
})
