// @vitest-environment node
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { isValidResolution } from "./complaintsRules"
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
  const { id: messageId } = await t.mutation(api.guestbook.submit, {
    pageId,
    authorName: "Анна",
    text: "Светлая память",
  })
  return { t, pageId, messageId, asMain: as(ids.main), asMod: as(ids.mod), asUser: as(ids.user) }
}

describe("rules", () => {
  it("allows only sensible resolutions per target", () => {
    expect(isValidResolution("page", "blocked")).toBe(true)
    expect(isValidResolution("page", "hidden")).toBe(false)
    expect(isValidResolution("page", "deleted")).toBe(false)
    expect(isValidResolution("message", "hidden")).toBe(true)
    expect(isValidResolution("message", "deleted")).toBe(true)
    expect(isValidResolution("message", "blocked")).toBe(false)
    for (const target of ["page", "message"] as const) {
      expect(isValidResolution(target, "warned")).toBe(true)
      expect(isValidResolution(target, "dismissed")).toBe(true)
    }
  })
})

describe("submitting a complaint", () => {
  it("accepts a complaint about a page from a visitor and trims text", async () => {
    const { t, asMod, pageId } = await setup()
    await t.mutation(api.complaints.submit, {
      targetType: "page",
      pageId,
      reason: "fake_info",
      details: "  Неверные даты  ",
      contact: " a@b.ru ",
    })
    const { rows } = await asMod.query(api.adminComplaints.list, { tab: "open" })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      targetType: "page",
      reason: "fake_info",
      details: "Неверные даты",
      contact: "a@b.ru",
      status: "open",
      pageName: "Иван Иванов",
      messageId: null,
    })
  })

  it("takes the page of a message from the message itself, never from the client", async () => {
    const { t, asMod, messageId, pageId } = await setup()
    const { id: otherPage } = await t.mutation(api.pages.create, { ...pageArgs, fullName: "Другой" })
    await t.mutation(api.complaints.submit, {
      targetType: "message",
      messageId,
      pageId: otherPage, // a lie
      reason: "spam",
    })
    const { rows } = await asMod.query(api.adminComplaints.list, { tab: "open" })
    expect(rows[0].pageId).toBe(pageId)
    expect(rows[0]).toMatchObject({ messageText: "Светлая память", messageAuthor: "Анна" })
  })

  it("needs the right target for each type", async () => {
    const { t, pageId, messageId } = await setup()
    await expect(t.mutation(api.complaints.submit, { targetType: "page", reason: "spam" })).rejects.toThrow()
    await expect(t.mutation(api.complaints.submit, { targetType: "message", pageId, reason: "spam" })).rejects.toThrow()
    await t.run((ctx) => ctx.db.delete(messageId))
    await expect(
      t.mutation(api.complaints.submit, { targetType: "message", messageId, reason: "spam" }),
    ).rejects.toThrow("не найдено")
  })

  it("limits length and how fast one browser can send complaints", async () => {
    const { t, pageId } = await setup()
    await expect(
      t.mutation(api.complaints.submit, { targetType: "page", pageId, reason: "spam", details: "я".repeat(1001) }),
    ).rejects.toThrow()
    await expect(
      t.mutation(api.complaints.submit, { targetType: "page", pageId, reason: "spam", contact: "я".repeat(201) }),
    ).rejects.toThrow()
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.complaints.submit, { targetType: "page", pageId, reason: "spam", deviceKey: "same" })
    }
    await expect(
      t.mutation(api.complaints.submit, { targetType: "page", pageId, reason: "spam", deviceKey: "same" }),
    ).rejects.toThrow("Слишком много")
    await expect(
      t.mutation(api.complaints.submit, { targetType: "page", pageId, reason: "spam", deviceKey: "other" }),
    ).resolves.toBeTruthy()
  })

  it("keeps a complained-about message out of the 90-day purge", async () => {
    const { t, asMod, messageId } = await setup()
    await asMod.mutation(api.adminGuestbook.hide, { messageId, reason: "spam" })
    await t.mutation(api.complaints.submit, { targetType: "message", messageId, reason: "insult" })
    await t.run((ctx) => ctx.db.patch(messageId, { hiddenAt: Date.now() - 100 * 86_400_000 }))
    expect(await t.mutation(internal.adminGuestbook.purgeExpiredHidden, {})).toBe(0)
    expect(await t.run((ctx) => ctx.db.get(messageId))).not.toBeNull()
  })
})

describe("the admin queue", () => {
  it("is closed to visitors and ordinary users", async () => {
    const { t, asUser } = await setup()
    await expect(t.query(api.adminComplaints.list, { tab: "open" })).rejects.toThrow()
    await expect(asUser.query(api.adminComplaints.list, { tab: "open" })).rejects.toThrow()
  })

  it("splits open and resolved, and searches text", async () => {
    const { t, asMod, pageId, messageId } = await setup()
    await t.mutation(api.complaints.submit, { targetType: "page", pageId, reason: "spam" })
    const messageComplaint = await t.mutation(api.complaints.submit, { targetType: "message", messageId, reason: "insult" })
    await asMod.mutation(api.adminComplaints.resolve, { complaintId: messageComplaint, resolution: "dismissed" })

    expect((await asMod.query(api.adminComplaints.list, { tab: "open" })).rows).toHaveLength(1)
    const resolved = await asMod.query(api.adminComplaints.list, { tab: "resolved" })
    expect(resolved.rows).toHaveLength(1)
    expect(resolved.rows[0].resolution).toBe("dismissed")
    expect((await asMod.query(api.adminComplaints.list, { tab: "all" })).rows).toHaveLength(2)
    expect((await asMod.query(api.adminComplaints.list, { tab: "all", search: "светлая" })).rows).toHaveLength(1)
  })

  it("still lists a complaint whose message was deleted", async () => {
    const { t, asMod, messageId } = await setup()
    await t.mutation(api.complaints.submit, { targetType: "message", messageId, reason: "spam" })
    await t.run((ctx) => ctx.db.delete(messageId))
    const { rows } = await asMod.query(api.adminComplaints.list, { tab: "open" })
    expect(rows).toHaveLength(1)
    expect(rows[0].messageText).toBeNull()
  })
})

describe("reacting to a complaint", () => {
  it("hides the message through the normal moderation path and closes the complaint", async () => {
    const { t, asMod, messageId, pageId } = await setup()
    const id = await t.mutation(api.complaints.submit, { targetType: "message", messageId, reason: "insult" })
    await asMod.mutation(api.adminComplaints.resolve, { complaintId: id, resolution: "hidden", reason: "insult" })

    const message = await t.run((ctx) => ctx.db.get(messageId))
    expect(message).toMatchObject({ status: "hidden", approved: false, hiddenBy: "platform", hiddenReason: "insult" })
    expect(
      (await t.query(api.guestbook.list, { pageId, paginationOpts: { numItems: 10, cursor: null } })).page,
    ).toHaveLength(0)

    const log = await t.run((ctx) => ctx.db.query("moderationLog").collect())
    expect(log.map((l) => `${l.kind}:${l.action}`)).toEqual(["guestbook:hide", "content:update"])
  })

  it("deletes the message for good", async () => {
    const { t, asMod, messageId } = await setup()
    const id = await t.mutation(api.complaints.submit, { targetType: "message", messageId, reason: "personal_data" })
    await asMod.mutation(api.adminComplaints.resolve, { complaintId: id, resolution: "deleted", reason: "personal_data" })
    expect(await t.run((ctx) => ctx.db.get(messageId))).toBeNull()
    expect((await t.run((ctx) => ctx.db.get(id)))?.resolution).toBe("deleted")
  })

  it("blocks the page for a page complaint and remembers the previous status", async () => {
    const { t, asMod, pageId } = await setup()
    await t.run((ctx) => ctx.db.patch(pageId, { status: "reduced" }))
    const id = await t.mutation(api.complaints.submit, { targetType: "page", pageId, reason: "illegal" })
    await asMod.mutation(api.adminComplaints.resolve, { complaintId: id, resolution: "blocked" })

    const page = await t.run((ctx) => ctx.db.get(pageId))
    expect(page).toMatchObject({ status: "blocked", statusBeforeBlock: "reduced" })
    await asMod.mutation(api.admin.setPageBlocked, { pageId, blocked: false })
    expect((await t.run((ctx) => ctx.db.get(pageId)))?.status).toBe("reduced")
  })

  it("records a warning without touching anything else", async () => {
    const { t, asMod, pageId } = await setup()
    const id = await t.mutation(api.complaints.submit, { targetType: "page", pageId, reason: "fake_info" })
    await asMod.mutation(api.adminComplaints.resolve, { complaintId: id, resolution: "warned" })
    expect((await t.run((ctx) => ctx.db.get(pageId)))?.status).toBe("pending_payment")
    const complaint = await t.run((ctx) => ctx.db.get(id))
    expect(complaint).toMatchObject({ status: "resolved", resolution: "warned" })
    expect(complaint?.resolvedBy).toBeDefined()
  })

  it("refuses actions that do not fit the target, repeats, and non-admins", async () => {
    const { t, asMod, asUser, pageId, messageId } = await setup()
    const pageComplaint = await t.mutation(api.complaints.submit, { targetType: "page", pageId, reason: "spam" })
    const messageComplaint = await t.mutation(api.complaints.submit, { targetType: "message", messageId, reason: "spam" })

    await expect(asMod.mutation(api.adminComplaints.resolve, { complaintId: pageComplaint, resolution: "hidden" })).rejects.toThrow("недоступно")
    await expect(asMod.mutation(api.adminComplaints.resolve, { complaintId: messageComplaint, resolution: "blocked" })).rejects.toThrow("недоступно")
    await expect(asUser.mutation(api.adminComplaints.resolve, { complaintId: pageComplaint, resolution: "dismissed" })).rejects.toThrow()
    await expect(t.mutation(api.adminComplaints.resolve, { complaintId: pageComplaint, resolution: "dismissed" })).rejects.toThrow()

    await asMod.mutation(api.adminComplaints.resolve, { complaintId: pageComplaint, resolution: "dismissed" })
    await expect(asMod.mutation(api.adminComplaints.resolve, { complaintId: pageComplaint, resolution: "dismissed" })).rejects.toThrow("уже рассмотрена")
  })
})
