// @vitest-environment node
import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { detectHold, initialStatus } from "./guestbookRules"
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
  return { t, pageId, asMain: as(ids.main), asMod: as(ids.mod), asUser: as(ids.user) }
}

const publicList = (t: Awaited<ReturnType<typeof setup>>["t"], pageId: Id<"pages">) =>
  t.query(api.guestbook.list, { pageId, paginationOpts: { numItems: 50, cursor: null } })

const msg = (pageId: Id<"pages">, text = "Светлая память", extra = {}) => ({
  pageId,
  authorName: "Анна",
  text,
  ...extra,
})

afterEach(() => vi.useRealTimers())

describe("rules", () => {
  it("holds links and phone numbers but not ordinary text or dates", () => {
    expect(detectHold("Заходите на https://example.com")).toBe("link")
    expect(detectHold("смотрите www.site.ru")).toBe("link")
    expect(detectHold("пишите на pomnim.ru")).toBe("link")
    expect(detectHold("звоните +7 (912) 345-67-89")).toBe("phone")
    expect(detectHold("8 912 345 67 89")).toBe("phone")
    expect(detectHold("Светлая память. Жил с 12.05.1950 по 03.02.2020")).toBeNull()
    expect(detectHold("Помним и любим")).toBeNull()
  })

  it("puts platform moderation before the owner's review", () => {
    const base = { platformModeration: false, requireApproval: false, held: null }
    expect(initialStatus(base)).toBe("published")
    expect(initialStatus({ ...base, requireApproval: true })).toBe("pending_owner")
    expect(initialStatus({ ...base, platformModeration: true, requireApproval: true })).toBe(
      "pending_platform",
    )
    expect(initialStatus({ ...base, held: "link" })).toBe("pending_platform")
  })
})

describe("submitting a message", () => {
  it("publishes at once on an unmoderated page", async () => {
    const { t, pageId } = await setup()
    const res = await t.mutation(api.guestbook.submit, msg(pageId))
    expect(res.status).toBe("published")
    expect((await publicList(t, pageId)).page).toHaveLength(1)
  })

  it("keeps the old `add` working and returning an id", async () => {
    const { t, pageId } = await setup()
    const id = await t.mutation(api.guestbook.add, msg(pageId))
    expect(typeof id).toBe("string")
    expect((await publicList(t, pageId)).page).toHaveLength(1)
  })

  it("never exposes moderation fields publicly", async () => {
    const { t, pageId } = await setup()
    await t.mutation(api.guestbook.submit, msg(pageId, "ok", { deviceKey: "dev-1" }))
    const [item] = (await publicList(t, pageId)).page
    expect(item).not.toHaveProperty("deviceKey")
    expect(item).not.toHaveProperty("status")
  })

  it("waits for the owner when the owner's review is on", async () => {
    const { t, pageId } = await setup()
    await t.run((ctx) => ctx.db.patch(pageId, { requireApproval: true }))
    const res = await t.mutation(api.guestbook.submit, msg(pageId))
    expect(res.status).toBe("pending_owner")
    expect((await publicList(t, pageId)).page).toHaveLength(0)
  })

  it("sends to platform moderation when the owner asked for it", async () => {
    const { t, pageId } = await setup()
    await t.run((ctx) => ctx.db.patch(pageId, { platformModeration: true }))
    const res = await t.mutation(api.guestbook.submit, msg(pageId))
    expect(res.status).toBe("pending_platform")
  })

  it("holds messages with links for platform review whatever the settings", async () => {
    const { t, pageId } = await setup()
    const res = await t.mutation(api.guestbook.submit, msg(pageId, "купи тут https://spam.example"))
    expect(res.status).toBe("pending_platform")
  })

  it("rejects too long names and texts", async () => {
    const { t, pageId } = await setup()
    await expect(
      t.mutation(api.guestbook.submit, { ...msg(pageId), authorName: "я".repeat(61) }),
    ).rejects.toThrow()
    await expect(
      t.mutation(api.guestbook.submit, msg(pageId, "я".repeat(2001))),
    ).rejects.toThrow()
  })

  it("limits how fast one browser can post", async () => {
    const { t, pageId } = await setup()
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.guestbook.submit, msg(pageId, `сообщение ${i}`, { deviceKey: "same" }))
    }
    await expect(
      t.mutation(api.guestbook.submit, msg(pageId, "шестое", { deviceKey: "same" })),
    ).rejects.toThrow("Слишком много")
    await expect(
      t.mutation(api.guestbook.submit, msg(pageId, "другой браузер", { deviceKey: "other" })),
    ).resolves.toBeTruthy()
  })
})

describe("admin queue", () => {
  it("is closed to visitors and ordinary users", async () => {
    const { t, asUser } = await setup()
    await expect(t.query(api.adminGuestbook.list, { tab: "queue" })).rejects.toThrow()
    await expect(asUser.query(api.adminGuestbook.list, { tab: "queue" })).rejects.toThrow()
  })

  it("shows every pending message, including pages with an active owner", async () => {
    const { t, pageId, asMod } = await setup()
    await t.run((ctx) => ctx.db.patch(pageId, { requireApproval: true }))
    await t.mutation(api.guestbook.submit, msg(pageId, "ждёт владельца"))
    await t.run((ctx) => ctx.db.patch(pageId, { platformModeration: true, requireApproval: false }))
    await t.mutation(api.guestbook.submit, msg(pageId, "ждёт платформу"))
    await t.run((ctx) => ctx.db.patch(pageId, { platformModeration: false }))
    await t.mutation(api.guestbook.submit, msg(pageId, "опубликовано"))

    const queue = await asMod.query(api.adminGuestbook.list, { tab: "queue" })
    expect(queue.rows.map((r) => r.status).sort()).toEqual(["pending_owner", "pending_platform"])
    expect(queue.rows[0].pageName).toBe("Иван Иванов")

    const all = await asMod.query(api.adminGuestbook.list, { tab: "all" })
    expect(all.rows).toHaveLength(3)
  })

  it("treats old messages without a status as pending or published by `approved`", async () => {
    const { t, pageId, asMod } = await setup()
    await t.run(async (ctx) => {
      await ctx.db.insert("guestbookMessages", { pageId, authorName: "А", text: "старое ждёт", approved: false })
      await ctx.db.insert("guestbookMessages", { pageId, authorName: "Б", text: "старое ок", approved: true })
    })
    const queue = await asMod.query(api.adminGuestbook.list, { tab: "queue" })
    expect(queue.rows.map((r) => r.text)).toEqual(["старое ждёт"])
    expect(queue.rows[0].status).toBe("pending_owner")

    const filled = await t.mutation(internal.adminGuestbook.backfillStatuses, {})
    expect(filled).toBe(2)
  })

  it("filters by search text", async () => {
    const { t, pageId, asMod } = await setup()
    await t.mutation(api.guestbook.submit, msg(pageId, "про садовника"))
    await t.mutation(api.guestbook.submit, msg(pageId, "про друга"))
    const found = await asMod.query(api.adminGuestbook.list, { tab: "all", search: "  САДОВ" })
    expect(found.rows.map((r) => r.text)).toEqual(["про садовника"])
  })

  it("flags messages that wait for the owner longer than 14 days", async () => {
    const { t, pageId, asMod } = await setup()
    await t.run((ctx) => ctx.db.patch(pageId, { requireApproval: true }))
    await t.mutation(api.guestbook.submit, msg(pageId, "ждёт владельца"))

    const fresh = await asMod.query(api.adminGuestbook.list, { tab: "queue" })
    expect(fresh.rows[0].overdue).toBe(false)

    // Move the clock 15 days ahead: the same message is now overdue.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(Date.now() + 15 * 86_400_000)
    const later = await asMod.query(api.adminGuestbook.list, { tab: "queue" })
    expect(later.rows[0].overdue).toBe(true)
  })
})

describe("moderation actions", () => {
  it("walks a message through platform review, then the owner's review", async () => {
    const { t, pageId, asMod } = await setup()
    await t.run((ctx) => ctx.db.patch(pageId, { platformModeration: true, requireApproval: true }))
    const { id } = await t.mutation(api.guestbook.submit, msg(pageId))

    await asMod.mutation(api.adminGuestbook.approve, { messageId: id })
    expect((await publicList(t, pageId)).page).toHaveLength(0) // now waits for the owner
    const [afterPlatform] = (await asMod.query(api.adminGuestbook.list, { tab: "queue" })).rows
    expect(afterPlatform.status).toBe("pending_owner")

    await asMod.mutation(api.adminGuestbook.approve, { messageId: id })
    expect((await publicList(t, pageId)).page).toHaveLength(1)
    await expect(asMod.mutation(api.adminGuestbook.approve, { messageId: id })).rejects.toThrow()
  })

  it("hides with a reason, restores, and logs each step", async () => {
    const { t, pageId, asMod } = await setup()
    const { id } = await t.mutation(api.guestbook.submit, msg(pageId))
    await asMod.mutation(api.adminGuestbook.hide, { messageId: id, reason: "spam" })
    expect((await publicList(t, pageId)).page).toHaveLength(0)
    const hidden = await asMod.query(api.adminGuestbook.list, { tab: "hidden" })
    expect(hidden.rows[0]).toMatchObject({ status: "hidden", hiddenBy: "platform", hiddenReason: "spam" })

    await asMod.mutation(api.adminGuestbook.restore, { messageId: id })
    expect((await publicList(t, pageId)).page).toHaveLength(1)

    const log = await t.run((ctx) => ctx.db.query("moderationLog").collect())
    expect(log.map((l) => l.action)).toEqual(["hide", "restore"])
  })

  it("does not restore what the owner hid", async () => {
    const { t, pageId, asMod } = await setup()
    const { id } = await t.mutation(api.guestbook.submit, msg(pageId))
    await t.run((ctx) => ctx.db.patch(id, { status: "hidden", approved: false, hiddenBy: "owner", hiddenAt: Date.now() }))
    await expect(asMod.mutation(api.adminGuestbook.restore, { messageId: id })).rejects.toThrow()
  })

  it("lets a moderator delete for good and keeps a log without the text", async () => {
    const { t, pageId, asMod, asUser } = await setup()
    const { id } = await t.mutation(api.guestbook.submit, msg(pageId, "личные данные тут"))
    await expect(asUser.mutation(api.adminGuestbook.remove, { messageId: id, reason: "spam" })).rejects.toThrow()

    await asMod.mutation(api.adminGuestbook.remove, { messageId: id, reason: "personal_data" })
    expect(await t.run((ctx) => ctx.db.get(id))).toBeNull()
    const log = await t.run((ctx) => ctx.db.query("moderationLog").collect())
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ action: "delete", reason: "personal_data" })
    expect(JSON.stringify(log[0])).not.toContain("личные данные")
  })

  it("blocks moderation actions from visitors and ordinary users", async () => {
    const { t, pageId, asUser } = await setup()
    const { id } = await t.mutation(api.guestbook.submit, msg(pageId))
    await expect(t.mutation(api.adminGuestbook.hide, { messageId: id, reason: "spam" })).rejects.toThrow()
    await expect(asUser.mutation(api.adminGuestbook.hide, { messageId: id, reason: "spam" })).rejects.toThrow()
    await expect(asUser.mutation(api.adminGuestbook.approve, { messageId: id })).rejects.toThrow()
  })
})

describe("retention", () => {
  it("purges hidden messages after 90 days unless a complaint references them", async () => {
    const { t, pageId, asMod } = await setup()
    const ids: Id<"guestbookMessages">[] = []
    for (const text of ["старое", "свежее", "жалоба"]) {
      const { id } = await t.mutation(api.guestbook.submit, msg(pageId, text))
      await asMod.mutation(api.adminGuestbook.hide, { messageId: id, reason: "spam" })
      ids.push(id)
    }
    const day = 86_400_000
    await t.run(async (ctx) => {
      await ctx.db.patch(ids[0], { hiddenAt: Date.now() - 100 * day })
      await ctx.db.patch(ids[1], { hiddenAt: Date.now() - 10 * day })
      await ctx.db.patch(ids[2], { hiddenAt: Date.now() - 100 * day, complaintId: "c1" })
    })
    expect(await t.mutation(internal.adminGuestbook.purgeExpiredHidden, {})).toBe(1)
    expect(await t.run((ctx) => ctx.db.get(ids[0]))).toBeNull()
    expect(await t.run((ctx) => ctx.db.get(ids[1]))).not.toBeNull()
    expect(await t.run((ctx) => ctx.db.get(ids[2]))).not.toBeNull()
  })
})
