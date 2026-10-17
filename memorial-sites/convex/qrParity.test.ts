// @vitest-environment node
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { generateNumericId } from "./qrRules"
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
  const { id: pageId, slug } = await t.mutation(api.pages.create, pageArgs)
  return { t, pageId, slug, asMain: as(ids.main), asMod: as(ids.mod), asUser: as(ids.user) }
}

afterEach(() => vi.useRealTimers())

describe("numeric ids", () => {
  it("are 8 digits without a leading zero", () => {
    for (let i = 0; i < 300; i++) expect(generateNumericId()).toMatch(/^[1-9]\d{7}$/)
  })

  it("are issued on create, are unique, and are searchable", async () => {
    const { asMain, pageId } = await setup()
    const ids = new Set<string>()
    let last = ""
    for (let i = 0; i < 30; i++) {
      const created = await asMain.mutation(api.adminQr.create, { pageId })
      expect(created.numericId).toMatch(/^[1-9]\d{7}$/)
      ids.add(created.numericId)
      last = created.numericId
    }
    expect(ids.size).toBe(30)

    const found = await asMain.query(api.adminQr.list, { search: last })
    expect(found.rows).toHaveLength(1)
    expect(found.rows[0].numericId).toBe(last)
  })
})

describe("paging and order", () => {
  it("shows a limited number and reports the total", async () => {
    const { asMain, pageId } = await setup()
    for (let i = 0; i < 5; i++) await asMain.mutation(api.adminQr.create, { pageId, label: `код ${i}` })

    const first = await asMain.query(api.adminQr.list, { limit: 2 })
    expect(first.rows).toHaveLength(2)
    expect(first.total).toBe(5)
    expect(first.truncated).toBe(true)

    const all = await asMain.query(api.adminQr.list, { limit: 10 })
    expect(all.rows).toHaveLength(5)
    expect(all.truncated).toBe(false)

    const narrowed = await asMain.query(api.adminQr.list, { search: "код 3", limit: 2 })
    expect(narrowed.total).toBe(1)
  })

  it("puts the most recently changed code first", async () => {
    const { asMain, pageId } = await setup()
    vi.useFakeTimers({ toFake: ["Date"] })
    const t0 = Date.now()
    const labels = ["A", "B", "C"]
    const created: Record<string, Id<"qrCodes">> = {}
    for (const [i, label] of labels.entries()) {
      vi.setSystemTime(t0 + i * 1000)
      created[label] = (await asMain.mutation(api.adminQr.create, { pageId, label }))._id
    }
    const order = async () => (await asMain.query(api.adminQr.list, {})).rows.map((r) => r.label)
    expect(await order()).toEqual(["C", "B", "A"])

    vi.setSystemTime(t0 + 5000)
    await asMain.mutation(api.adminQr.update, { qrId: created.A, label: "A2" })
    expect(await order()).toEqual(["A2", "C", "B"])
  })
})

describe("history of changes", () => {
  it("records every change of destination, and only those", async () => {
    const { asMain, pageId, slug } = await setup()
    const { _id } = await asMain.mutation(api.adminQr.create, { pageId, label: "Памятник" })
    expect((await asMain.query(api.adminQr.history, {})).total).toBe(0)

    await asMain.mutation(api.adminQr.update, { qrId: _id, targetUrl: "https://example.com/a" })
    await asMain.mutation(api.adminQr.update, { qrId: _id, targetUrl: "https://example.com/a" }) // same address
    await asMain.mutation(api.adminQr.update, { qrId: _id, label: "Новое название" }) // label only
    await asMain.mutation(api.adminQr.update, { qrId: _id, status: "disabled" }) // status only
    await asMain.mutation(api.adminQr.update, { qrId: _id, pageId })

    const history = await asMain.query(api.adminQr.history, {})
    expect(history.total).toBe(2)
    // newest first
    expect(history.items[0]).toMatchObject({
      oldTarget: "https://example.com/a",
      newTarget: `Страница: Иван Иванов (${slug})`,
      label: "Новое название",
    })
    expect(history.items[1]).toMatchObject({
      oldTarget: `Страница: Иван Иванов (${slug})`,
      newTarget: "https://example.com/a",
      label: "Памятник",
    })
    expect(history.items[0].numericId).toMatch(/^[1-9]\d{7}$/)
  })

  it("can be searched and limited", async () => {
    const { asMain, pageId } = await setup()
    const { _id } = await asMain.mutation(api.adminQr.create, { pageId })
    await asMain.mutation(api.adminQr.update, { qrId: _id, targetUrl: "https://alpha.example" })
    await asMain.mutation(api.adminQr.update, { qrId: _id, targetUrl: "https://beta.example" })

    const found = await asMain.query(api.adminQr.history, { search: "ALPHA" })
    expect(found.total).toBe(2) // "alpha" is the new address of one entry and the old one of the next
    const limited = await asMain.query(api.adminQr.history, { limit: 1 })
    expect(limited.items).toHaveLength(1)
    expect(limited.truncated).toBe(true)
    expect((await asMain.query(api.adminQr.history, { search: "нет такого" })).total).toBe(0)
  })

  it("is closed to visitors, users and moderators", async () => {
    const { t, asUser, asMod } = await setup()
    for (const caller of [t, asUser, asMod]) {
      await expect(caller.query(api.adminQr.history, {})).rejects.toThrow()
    }
  })
})

describe("deleting a code", () => {
  it("removes the code and its scans, keeps the history, writes to the audit log", async () => {
    const { t, asMain, pageId } = await setup()
    const { _id, code } = await asMain.mutation(api.adminQr.create, { pageId })
    await asMain.mutation(api.adminQr.update, { qrId: _id, targetUrl: "https://example.com/a" })
    await t.mutation(api.qr.resolve, { code })
    await t.mutation(api.qr.resolve, { code })

    await asMain.mutation(api.adminQr.remove, { qrId: _id })

    expect(await t.mutation(api.qr.resolve, { code })).toBeNull()
    expect((await asMain.query(api.adminQr.list, {})).total).toBe(0)
    expect(await t.run((ctx) => ctx.db.query("qrScans").collect())).toHaveLength(0)
    expect((await asMain.query(api.adminQr.history, {})).total).toBe(1)

    const log = await t.run((ctx) => ctx.db.query("moderationLog").collect())
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ kind: "qr", action: "delete", targetId: code })
  })

  it("is closed to visitors, users and moderators", async () => {
    const { t, asMain, asUser, asMod, pageId } = await setup()
    const { _id } = await asMain.mutation(api.adminQr.create, { pageId })
    for (const caller of [t, asUser, asMod]) {
      await expect(caller.mutation(api.adminQr.remove, { qrId: _id })).rejects.toThrow()
    }
    expect((await asMain.query(api.adminQr.list, {})).total).toBe(1)
  })
})
