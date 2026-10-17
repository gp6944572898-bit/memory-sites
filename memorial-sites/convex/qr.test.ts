// @vitest-environment node
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  bucketByDay,
  generateCode,
  isTemporaryHost,
  normalizeBaseUrl,
  normalizeCode,
  validateTargetUrl,
} from "./qrRules"
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

describe("rules", () => {
  it("generates 6-character codes from an unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^[2-9A-HJKMNP-Z]{6}$/)
    }
    expect(generateCode(() => 0)).toBe("222222")
  })

  it("normalizes scanned codes", () => {
    expect(normalizeCode("  ab3c 4 ".replace(" 4 ", "4"))).toBe("AB3C4")
  })

  it("accepts only plain web addresses as targets", () => {
    expect(validateTargetUrl(" https://example.ru/a?b=1 ")).toBe("https://example.ru/a?b=1")
    expect(() => validateTargetUrl("javascript:alert(1)")).toThrow()
    expect(() => validateTargetUrl("data:text/html,hi")).toThrow()
    expect(() => validateTargetUrl("https://user:pass@example.ru")).toThrow()
    expect(() => validateTargetUrl("не адрес")).toThrow()
    expect(() => validateTargetUrl("")).toThrow()
  })

  it("keeps only the origin of the public site address, https only", () => {
    expect(normalizeBaseUrl("https://pomnim.ru/some/path/")).toBe("https://pomnim.ru")
    expect(() => normalizeBaseUrl("http://pomnim.ru")).toThrow()
    expect(() => normalizeBaseUrl("pomnim.ru")).toThrow()
  })

  it("recognises preview and development hosts", () => {
    expect(isTemporaryHost("https://q0zacg0yh7flitl266xsfaxl.macaly.dev")).toBe(true)
    expect(isTemporaryHost("https://x.convex.site")).toBe(true)
    expect(isTemporaryHost("https://localhost:3000")).toBe(true)
    expect(isTemporaryHost("https://pomnim.ru")).toBe(false)
  })

  it("buckets scans by day in the admin's time zone", () => {
    const now = Date.UTC(2026, 8, 21, 12, 0) // 21 Sep, 12:00 UTC
    // 22:30 UTC on the 20th is already the 21st in Moscow (UTC+3).
    const scan = Date.UTC(2026, 8, 20, 22, 30)
    const utc = bucketByDay([scan], now, 3, 0)
    const moscow = bucketByDay([scan], now, 3, 180)
    expect(utc.map((b) => b.count)).toEqual([0, 1, 0])
    expect(moscow.map((b) => b.count)).toEqual([0, 0, 1])
    expect(utc).toHaveLength(3)
  })
})

describe("access", () => {
  it("is closed to visitors, users and moderators", async () => {
    const { t, pageId, asUser, asMod } = await setup()
    for (const who of [t, asUser, asMod]) {
      await expect(who.query(api.adminQr.list, {})).rejects.toThrow()
      await expect(who.mutation(api.adminQr.create, { pageId })).rejects.toThrow()
      await expect(who.query(api.adminQr.getSettings, {})).rejects.toThrow()
      await expect(who.mutation(api.adminQr.setBaseUrl, { url: "https://a.ru" })).rejects.toThrow()
    }
  })
})

describe("site address", () => {
  it("starts unset (and temporary), then stores the normalized origin", async () => {
    const { asMain } = await setup()
    expect(await asMain.query(api.adminQr.getSettings, {})).toEqual({
      publicBaseUrl: null,
      isTemporary: true,
    })
    await asMain.mutation(api.adminQr.setBaseUrl, { url: "https://pomnim.ru/x/" })
    expect(await asMain.query(api.adminQr.getSettings, {})).toEqual({
      publicBaseUrl: "https://pomnim.ru",
      isTemporary: false,
    })
    await asMain.mutation(api.adminQr.setBaseUrl, { url: "https://abc.macaly.dev" })
    expect((await asMain.query(api.adminQr.getSettings, {})).isTemporary).toBe(true)
  })
})

describe("creating and listing", () => {
  it("creates a code for a page and shows it in the list", async () => {
    const { asMain, pageId } = await setup()
    const { code } = await asMain.mutation(api.adminQr.create, { pageId, label: "  Памятник  " })
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{6}$/)
    const { rows } = await asMain.query(api.adminQr.list, {})
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ code, label: "Памятник", status: "active", scanCount: 0 })
    expect(rows[0].target).toMatchObject({ kind: "page", pageName: "Иван Иванов" })
  })

  it("needs exactly one target and a valid address", async () => {
    const { asMain, pageId } = await setup()
    await expect(asMain.mutation(api.adminQr.create, {})).rejects.toThrow()
    await expect(
      asMain.mutation(api.adminQr.create, { pageId, targetUrl: "https://a.ru" }),
    ).rejects.toThrow()
    await expect(
      asMain.mutation(api.adminQr.create, { targetUrl: "javascript:alert(1)" }),
    ).rejects.toThrow()
    const { _id } = await asMain.mutation(api.adminQr.create, { targetUrl: "https://a.ru/x" })
    expect(_id).toBeTruthy()
  })

  it("searches by code, label and page name", async () => {
    const { asMain, pageId } = await setup()
    const a = await asMain.mutation(api.adminQr.create, { pageId, label: "Памятник" })
    await asMain.mutation(api.adminQr.create, { targetUrl: "https://a.ru", label: "Буклет" })
    const byLabel = await asMain.query(api.adminQr.list, { search: "буклет" })
    expect(byLabel.rows).toHaveLength(1)
    const byPage = await asMain.query(api.adminQr.list, { search: "иванов" })
    expect(byPage.rows.map((r) => r.code)).toEqual([a.code])
    const byCode = await asMain.query(api.adminQr.list, { search: a.code.toLowerCase() })
    expect(byCode.rows).toHaveLength(1)
  })
})

describe("scanning", () => {
  it("sends a page code to the page and counts the scan", async () => {
    const { t, asMain, pageId, slug } = await setup()
    const { _id, code } = await asMain.mutation(api.adminQr.create, { pageId })
    expect(await t.mutation(api.qr.resolve, { code: code.toLowerCase() })).toEqual({
      kind: "page",
      slug,
    })
    await t.mutation(api.qr.resolve, { code })
    await t.mutation(api.qr.resolve, { code })
    const stats = await asMain.query(api.adminQr.stats, { qrId: _id, days: 7, tzOffsetMinutes: 180 })
    expect(stats.total).toBe(3)
    expect(stats.perDay.reduce((sum, d) => sum + d.count, 0)).toBe(3)
    expect(stats.lastScanAt).not.toBeNull()
  })

  it("sends an external code to its address", async () => {
    const { t, asMain } = await setup()
    const { code } = await asMain.mutation(api.adminQr.create, { targetUrl: "https://a.ru/x" })
    expect(await t.mutation(api.qr.resolve, { code })).toEqual({ kind: "url", url: "https://a.ru/x" })
  })

  it("leads nowhere for unknown, disabled or blocked-page codes, and does not count them", async () => {
    const { t, asMain, asMod, pageId } = await setup()
    expect(await t.mutation(api.qr.resolve, { code: "ZZZZZZZZ" })).toBeNull()
    expect(await t.mutation(api.qr.resolve, { code: "" })).toBeNull()

    const { _id, code } = await asMain.mutation(api.adminQr.create, { pageId })
    await asMain.mutation(api.adminQr.update, { qrId: _id, status: "disabled" })
    expect(await t.mutation(api.qr.resolve, { code })).toBeNull()

    await asMain.mutation(api.adminQr.update, { qrId: _id, status: "active" })
    await asMod.mutation(api.admin.setPageBlocked, { pageId, blocked: true })
    expect(await t.mutation(api.qr.resolve, { code })).toBeNull()

    const stats = await asMain.query(api.adminQr.stats, { qrId: _id, days: 7, tzOffsetMinutes: 0 })
    expect(stats.total).toBe(0)
  })
})

describe("changing a printed code", () => {
  it("retargets without changing the code, and edits the label", async () => {
    const { t, asMain, pageId, slug } = await setup()
    const { _id, code } = await asMain.mutation(api.adminQr.create, { pageId, label: "Старое" })

    await asMain.mutation(api.adminQr.update, { qrId: _id, targetUrl: "https://a.ru/new", label: "" })
    expect(await t.mutation(api.qr.resolve, { code })).toEqual({ kind: "url", url: "https://a.ru/new" })
    const [row] = (await asMain.query(api.adminQr.list, {})).rows
    expect(row.code).toBe(code)
    expect(row.label).toBeNull()

    await asMain.mutation(api.adminQr.update, { qrId: _id, pageId })
    expect(await t.mutation(api.qr.resolve, { code })).toEqual({ kind: "page", slug })
  })

  it("refuses two targets or a bad address at once", async () => {
    const { asMain, pageId } = await setup()
    const { _id } = await asMain.mutation(api.adminQr.create, { pageId })
    await expect(
      asMain.mutation(api.adminQr.update, { qrId: _id, pageId, targetUrl: "https://a.ru" }),
    ).rejects.toThrow()
    await expect(
      asMain.mutation(api.adminQr.update, { qrId: _id, targetUrl: "ftp://a.ru" }),
    ).rejects.toThrow()
  })
})
