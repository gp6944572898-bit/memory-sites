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
    const main = await ctx.db.insert("users", { email: "main@example.com", name: "Главный" })
    const mod = await ctx.db.insert("users", { email: "mod@example.com" })
    const anna = await ctx.db.insert("users", { email: "anna@example.com", name: "Анна Петрова" })
    const boris = await ctx.db.insert("users", { email: "boris@example.com" })
    const guest = await ctx.db.insert("users", { isAnonymous: true }) // anonymous visitor
    await ctx.db.insert("adminRoles", { userId: main, role: "main_admin" })
    await ctx.db.insert("adminRoles", { userId: mod, role: "moderator" })
    return { main, mod, anna, boris, guest }
  })
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|session` })
  return { t, ids, asMain: as(ids.main), asMod: as(ids.mod), asAnna: as(ids.anna), as }
}

const auditLog = (t: Awaited<ReturnType<typeof setup>>["t"]) =>
  t.run((ctx) => ctx.db.query("moderationLog").collect())

describe("users list", () => {
  it("is closed to visitors, ordinary users and moderators", async () => {
    const { t, asAnna, asMod } = await setup()
    for (const caller of [t, asAnna, asMod]) {
      await expect(caller.query(api.adminUsers.list, {})).rejects.toThrow()
    }
  })

  it("lists registered users only and hides anonymous visitors", async () => {
    const { asMain } = await setup()
    const { rows } = await asMain.query(api.adminUsers.list, {})
    expect(rows.map((r) => r.email).sort()).toEqual([
      "anna@example.com",
      "boris@example.com",
      "main@example.com",
      "mod@example.com",
    ])
  })

  it("searches by e-mail or name and shows role, block and page count", async () => {
    const { t, ids, asMain, asAnna } = await setup()
    await asAnna.mutation(api.pages.create, pageArgs)
    await asMain.mutation(api.admin.setUserBlocked, { userId: ids.boris, blocked: true, reason: "спам" })

    const byName = await asMain.query(api.adminUsers.list, { search: " ПЕТРОВА " })
    expect(byName.rows).toHaveLength(1)
    expect(byName.rows[0]).toMatchObject({ email: "anna@example.com", pagesCount: 1, blocked: false, adminRole: null })

    const byMail = await asMain.query(api.adminUsers.list, { search: "boris@" })
    expect(byMail.rows[0]).toMatchObject({ blocked: true })

    const mods = await asMain.query(api.adminUsers.list, { search: "mod@" })
    expect(mods.rows[0].adminRole).toBe("moderator")
    expect(t).toBeDefined()
  })
})

describe("user profile", () => {
  it("shows their pages and the block reason", async () => {
    const { ids, asMain, asAnna } = await setup()
    const { slug } = await asAnna.mutation(api.pages.create, pageArgs)
    await asMain.mutation(api.admin.setUserBlocked, { userId: ids.anna, blocked: true, reason: "жалоба" })

    const profile = await asMain.query(api.adminUsers.get, { userId: ids.anna })
    expect(profile?.blockReason).toBe("жалоба")
    expect(profile?.user.blocked).toBe(true)
    expect(profile?.pages).toHaveLength(1)
    expect(profile?.pages[0]).toMatchObject({ slug, fullName: "Иван Иванов", status: "pending_payment" })
  })

  it("is closed to a moderator", async () => {
    const { ids, asMod } = await setup()
    await expect(asMod.query(api.adminUsers.get, { userId: ids.anna })).rejects.toThrow()
  })
})

describe("audit of blocking", () => {
  it("records who blocked / unblocked a user and a page", async () => {
    const { t, ids, asMain, asMod, asAnna } = await setup()
    const { id: pageId } = await asAnna.mutation(api.pages.create, pageArgs)
    await asMain.mutation(api.admin.setUserBlocked, { userId: ids.boris, blocked: true, reason: "спам" })
    await asMain.mutation(api.admin.setUserBlocked, { userId: ids.boris, blocked: false })
    await asMod.mutation(api.admin.setPageBlocked, { pageId, blocked: true })
    await asMod.mutation(api.admin.setPageBlocked, { pageId, blocked: false })

    const log = await auditLog(t)
    expect(log.map((l) => `${l.kind}:${l.action}`)).toEqual(["user:block", "user:unblock", "page:block", "page:unblock"])
    expect(log[0]).toMatchObject({ actorId: ids.main, targetId: ids.boris, reason: "спам" })
    expect(log[2]).toMatchObject({ actorId: ids.mod, pageId })
  })
})

describe("admin management", () => {
  it("is closed to everyone but the main admin", async () => {
    const { t, ids, asAnna, asMod } = await setup()
    for (const caller of [t, asAnna, asMod]) {
      await expect(caller.query(api.adminAdmins.list, {})).rejects.toThrow()
      await expect(caller.mutation(api.adminAdmins.add, { userId: ids.anna, role: "moderator" })).rejects.toThrow()
    }
  })

  it("lists admins with who granted the role", async () => {
    const { ids, asMain } = await setup()
    await asMain.mutation(api.adminAdmins.add, { userId: ids.anna, role: "moderator" })
    const list = await asMain.query(api.adminAdmins.list, {})
    expect(list.map((a) => a.email)).toEqual(["main@example.com", "mod@example.com", "anna@example.com"])
    expect(list[2]).toMatchObject({ role: "moderator", grantedByEmail: "main@example.com", blocked: false })
  })

  it("adds an admin from registered users and they get access at once", async () => {
    const { ids, asMain, asAnna } = await setup()
    expect(await asAnna.query(api.admin.me, {})).toBeNull()
    await asMain.mutation(api.adminAdmins.add, { userId: ids.anna, role: "moderator" })
    expect((await asAnna.query(api.admin.me, {}))?.role).toBe("moderator")
  })

  it("refuses anonymous, blocked, unknown and already-admin users", async () => {
    const { t, ids, asMain } = await setup()
    await expect(asMain.mutation(api.adminAdmins.add, { userId: ids.guest, role: "moderator" })).rejects.toThrow("зарегистрированного")
    await asMain.mutation(api.admin.setUserBlocked, { userId: ids.boris, blocked: true })
    await expect(asMain.mutation(api.adminAdmins.add, { userId: ids.boris, role: "moderator" })).rejects.toThrow("заблокирован")
    await expect(asMain.mutation(api.adminAdmins.add, { userId: ids.mod, role: "main_admin" })).rejects.toThrow("уже админ")
    const ghost = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "ghost@example.com" })
      await ctx.db.delete(id)
      return id
    })
    await expect(asMain.mutation(api.adminAdmins.add, { userId: ghost, role: "moderator" })).rejects.toThrow()
  })

  it("changes a role, logs it, and never lets anyone touch their own", async () => {
    const { t, ids, asMain } = await setup()
    await asMain.mutation(api.adminAdmins.setRole, { userId: ids.mod, role: "main_admin" })
    expect((await t.withIdentity({ subject: `${ids.mod}|s` }).query(api.admin.me, {}))?.role).toBe("main_admin")

    await expect(asMain.mutation(api.adminAdmins.setRole, { userId: ids.main, role: "moderator" })).rejects.toThrow("собственную")
    await expect(asMain.mutation(api.adminAdmins.setRole, { userId: ids.anna, role: "moderator" })).rejects.toThrow("не админ")

    const log = await auditLog(t)
    expect(log.at(-1)).toMatchObject({ kind: "admin_role", action: "change_role", reason: "moderator -> main_admin", actorId: ids.main })
  })

  it("removes an admin, who loses access at once, but not yourself", async () => {
    const { t, ids, asMain, asMod } = await setup()
    expect((await asMod.query(api.admin.me, {}))?.role).toBe("moderator")
    await asMain.mutation(api.adminAdmins.remove, { userId: ids.mod })
    expect(await asMod.query(api.admin.me, {})).toBeNull()

    await expect(asMain.mutation(api.adminAdmins.remove, { userId: ids.main })).rejects.toThrow("самого себя")
    const log = await auditLog(t)
    expect(log.at(-1)).toMatchObject({ action: "revoke_role", reason: "moderator" })
  })

  it("keeps at least one main admin when two exist and one demotes the other", async () => {
    const { ids, asMain, as } = await setup()
    await asMain.mutation(api.adminAdmins.setRole, { userId: ids.mod, role: "main_admin" })
    await asMain.mutation(api.adminAdmins.setRole, { userId: ids.mod, role: "moderator" })
    // the second main admin cannot remove the first one's only-ness either: self-changes are refused
    await expect(as(ids.main).mutation(api.adminAdmins.remove, { userId: ids.main })).rejects.toThrow()
    expect((await as(ids.main).query(api.admin.me, {}))?.role).toBe("main_admin")
  })
})
