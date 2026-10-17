// @vitest-environment node
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { hasCapability, type Capability } from "./permissions"
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
  return {
    t,
    ids,
    asMain: as(ids.main),
    asMod: as(ids.mod),
    asUser: as(ids.user),
  }
}

describe("permission matrix", () => {
  it("gives moderators only complaints, guestbook and page viewing/blocking", () => {
    const allowed: Capability[] = [
      "complaints.manage",
      "guestbook.moderate",
      "pages.view",
      "pages.block",
    ]
    const denied: Capability[] = [
      "pages.delete",
      "users.manage",
      "finance.manage",
      "admins.manage",
      "platform.settings",
      "qr.manage",
    ]
    for (const c of allowed) expect(hasCapability("moderator", c)).toBe(true)
    for (const c of denied) expect(hasCapability("moderator", c)).toBe(false)
  })

  it("gives the main admin everything and nobody nothing", () => {
    const all: Capability[] = [
      "complaints.manage",
      "guestbook.moderate",
      "pages.view",
      "pages.block",
      "pages.delete",
      "users.manage",
      "finance.manage",
      "admins.manage",
      "platform.settings",
      "qr.manage",
    ]
    for (const c of all) {
      expect(hasCapability("main_admin", c)).toBe(true)
      expect(hasCapability(null, c)).toBe(false)
    }
  })
})

describe("admin.me", () => {
  it("is null for visitors and ordinary users, role info for admins", async () => {
    const { t, asMain, asMod, asUser } = await setup()
    expect(await t.query(api.admin.me, {})).toBeNull()
    expect(await asUser.query(api.admin.me, {})).toBeNull()
    expect((await asMod.query(api.admin.me, {}))?.role).toBe("moderator")
    expect((await asMain.query(api.admin.me, {}))?.role).toBe("main_admin")
  })
})

describe("blocking users", () => {
  it("is limited to the main admin", async () => {
    const { t, ids, asMod, asUser } = await setup()
    const args = { userId: ids.user, blocked: true }
    await expect(t.mutation(api.admin.setUserBlocked, args)).rejects.toThrow()
    await expect(asUser.mutation(api.admin.setUserBlocked, args)).rejects.toThrow()
    await expect(asMod.mutation(api.admin.setUserBlocked, args)).rejects.toThrow(
      "Недостаточно прав",
    )
  })

  it("refuses to block yourself or another main admin", async () => {
    const { t, ids, asMain } = await setup()
    await expect(
      asMain.mutation(api.admin.setUserBlocked, { userId: ids.main, blocked: true }),
    ).rejects.toThrow("самого себя")

    const second = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "second@example.com" })
      await ctx.db.insert("adminRoles", { userId: id, role: "main_admin" })
      return id
    })
    await expect(
      asMain.mutation(api.admin.setUserBlocked, { userId: second, blocked: true }),
    ).rejects.toThrow("главного админа")
  })

  it("stops a blocked user from creating pages until unblocked", async () => {
    const { ids, asMain, asUser } = await setup()
    await asMain.mutation(api.admin.setUserBlocked, {
      userId: ids.user,
      blocked: true,
      reason: "спам",
    })
    await expect(asUser.mutation(api.pages.create, pageArgs)).rejects.toThrow(
      "заблокирован",
    )
    await asMain.mutation(api.admin.setUserBlocked, {
      userId: ids.user,
      blocked: false,
    })
    await expect(asUser.mutation(api.pages.create, pageArgs)).resolves.toBeTruthy()
  })

  it("takes admin access away from a blocked moderator", async () => {
    const { ids, asMain, asMod } = await setup()
    await asMain.mutation(api.admin.setUserBlocked, { userId: ids.mod, blocked: true })
    expect(await asMod.query(api.admin.me, {})).toBeNull()
  })
})

describe("page ownership", () => {
  it("records the creator and never exposes it publicly", async () => {
    const { t, ids, asUser } = await setup()
    const { slug, id } = await asUser.mutation(api.pages.create, pageArgs)
    const stored = await t.run((ctx) => ctx.db.get(id))
    expect(stored?.ownerId).toBe(ids.user)

    const publicPage = await t.query(api.pages.getBySlug, { slug })
    expect(publicPage?.fullName).toBe("Иван Иванов")
    expect(publicPage).not.toHaveProperty("ownerId")
  })

  it("lets signed-out visitors create a page without an owner", async () => {
    const { t } = await setup()
    const { id } = await t.mutation(api.pages.create, pageArgs)
    const stored = await t.run((ctx) => ctx.db.get(id))
    expect(stored?.ownerId).toBeUndefined()
  })
})

describe("blocking pages", () => {
  it("lets a moderator block, hides the page and shuts its interactions", async () => {
    const { t, asMod, asUser } = await setup()
    const { id, slug } = await t.mutation(api.pages.create, pageArgs)
    const campaign = await t.query(api.campaigns.getByPage, { pageId: id })
    expect(campaign).not.toBeNull()

    await expect(
      asUser.mutation(api.admin.setPageBlocked, { pageId: id, blocked: true }),
    ).rejects.toThrow()
    await asMod.mutation(api.admin.setPageBlocked, { pageId: id, blocked: true })

    expect(await t.query(api.pages.getBySlug, { slug })).toBeNull()
    expect(await t.query(api.campaigns.getByPage, { pageId: id })).toBeNull()
    await expect(
      t.mutation(api.guestbook.add, { pageId: id, authorName: "А", text: "Привет" }),
    ).rejects.toThrow("недоступна")
    await expect(
      t.mutation(api.campaigns.contribute, {
        campaignId: campaign!._id,
        amountRub: 100,
        anonymous: false,
      }),
    ).rejects.toThrow("недоступна")
  })

  it("restores the exact previous status on unblock", async () => {
    const { t, asMod } = await setup()
    const { id, slug } = await t.mutation(api.pages.create, pageArgs)
    await t.run((ctx) => ctx.db.patch(id, { status: "reduced" }))

    await asMod.mutation(api.admin.setPageBlocked, { pageId: id, blocked: true })
    await asMod.mutation(api.admin.setPageBlocked, { pageId: id, blocked: true }) // idempotent
    await asMod.mutation(api.admin.setPageBlocked, { pageId: id, blocked: false })

    const page = await t.query(api.pages.getBySlug, { slug })
    expect(page?.status).toBe("reduced")
    const stored = await t.run((ctx) => ctx.db.get(id))
    expect(stored?.statusBeforeBlock).toBeUndefined()
  })
})

describe("manual contribution cancel", () => {
  async function withContribution() {
    const ctx = await setup()
    const { id } = await ctx.t.mutation(api.pages.create, pageArgs)
    const campaign = await ctx.t.query(api.campaigns.getByPage, { pageId: id })
    const { contributionId } = await ctx.t.mutation(api.campaigns.contribute, {
      campaignId: campaign!._id,
      amountRub: 500,
      anonymous: false,
    })
    return { ...ctx, campaignId: campaign!._id, contributionId }
  }

  it("is closed to visitors, users and moderators", async () => {
    const { t, asUser, asMod, contributionId } = await withContribution()
    const args = { contributionId }
    await expect(t.mutation(api.campaigns.adminCancelContribution, args)).rejects.toThrow()
    await expect(asUser.mutation(api.campaigns.adminCancelContribution, args)).rejects.toThrow()
    await expect(asMod.mutation(api.campaigns.adminCancelContribution, args)).rejects.toThrow()
  })

  it("works for the main admin and updates the totals", async () => {
    const { t, asMain, campaignId, contributionId } = await withContribution()
    await asMain.mutation(api.campaigns.adminCancelContribution, { contributionId })
    const campaign = await t.run((ctx) => ctx.db.get(campaignId))
    expect(campaign?.collectedRub).toBe(0)
    expect(campaign?.participantsCount).toBe(0)
  })
})

describe("granting roles from the console", () => {
  it("matches the email case-insensitively and updates an existing role", async () => {
    const { t, ids } = await setup()
    await t.mutation(internal.admin.grantRoleByEmail, {
      email: " USER@Example.com ",
      role: "moderator",
    })
    const asUser = t.withIdentity({ subject: `${ids.user}|session` })
    expect((await asUser.query(api.admin.me, {}))?.role).toBe("moderator")

    await t.mutation(internal.admin.grantRoleByEmail, {
      email: "user@example.com",
      role: "main_admin",
    })
    expect((await asUser.query(api.admin.me, {}))?.role).toBe("main_admin")
  })

  it("fails clearly for an unknown email", async () => {
    const { t } = await setup()
    await expect(
      t.mutation(internal.admin.grantRoleByEmail, {
        email: "nobody@example.com",
        role: "moderator",
      }),
    ).rejects.toThrow("не найден")
  })
})
