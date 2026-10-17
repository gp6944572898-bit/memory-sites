// @vitest-environment node
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
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
  const created = await t.mutation(api.pages.create, pageArgs)
  return { t, ...created }
}

describe("owner token", () => {
  it("is issued on creation, long, and unique across pages", async () => {
    const { t } = await setup()
    const a = await t.mutation(api.pages.create, pageArgs)
    const b = await t.mutation(api.pages.create, pageArgs)
    expect(a.ownerToken.length).toBeGreaterThanOrEqual(32)
    expect(a.ownerToken).not.toBe(b.ownerToken)
  })

  it("is never exposed by the public page read", async () => {
    const { t, ownerToken, slug } = await setup()
    const publicPage = await t.query(api.pages.getBySlug, { slug })
    expect(JSON.stringify(publicPage)).not.toContain(ownerToken)
  })
})

describe("owner.get", () => {
  it("returns the page for a valid token and null otherwise", async () => {
    const { t, ownerToken } = await setup()
    const page = await t.query(api.owner.get, { token: ownerToken })
    expect(page).toMatchObject({ fullName: "Иван Иванов", status: "pending_payment", requireApproval: false })
    expect(await t.query(api.owner.get, { token: "not-a-real-token" })).toBeNull()
  })
})

describe("owner.updateContent", () => {
  it("edits content and validates", async () => {
    const { t, ownerToken } = await setup()
    await t.mutation(api.owner.updateContent, { token: ownerToken, fullName: "  Пётр Петров  ", bioText: "Новая история" })
    const page = await t.query(api.owner.get, { token: ownerToken })
    expect(page).toMatchObject({ fullName: "Пётр Петров", bioText: "Новая история" })

    await expect(
      t.mutation(api.owner.updateContent, { token: ownerToken, fullName: "   " }),
    ).rejects.toThrow()
    await expect(
      t.mutation(api.owner.updateContent, { token: ownerToken, fullName: "я".repeat(121) }),
    ).rejects.toThrow()
  })

  it("refuses an invalid token and a blocked page", async () => {
    const { t, ownerToken, id } = await setup()
    await expect(
      t.mutation(api.owner.updateContent, { token: "wrong", fullName: "X" }),
    ).rejects.toThrow("недействительна")

    await t.run((ctx) => ctx.db.patch(id, { status: "blocked" }))
    await expect(
      t.mutation(api.owner.updateContent, { token: ownerToken, fullName: "X" }),
    ).rejects.toThrow("заблокирована")
  })
})

describe("owner settings", () => {
  it("toggles the review setting", async () => {
    const { t, ownerToken } = await setup()
    await t.mutation(api.owner.setRequireApproval, { token: ownerToken, requireApproval: true })
    expect((await t.query(api.owner.get, { token: ownerToken }))?.requireApproval).toBe(true)
  })

  it("stores an optional e-mail for the owner's own reference, with basic validation", async () => {
    const { t, ownerToken } = await setup()
    await t.mutation(api.owner.setOwnerEmail, { token: ownerToken, email: "  Me@Example.com " })
    expect((await t.query(api.owner.get, { token: ownerToken }))?.ownerEmail).toBe("me@example.com")
    await expect(
      t.mutation(api.owner.setOwnerEmail, { token: ownerToken, email: "not-an-email" }),
    ).rejects.toThrow()
  })
})

describe("owner guestbook moderation", () => {
  async function withMessages() {
    const ctx = await setup()
    await ctx.t.mutation(api.owner.setRequireApproval, { token: ctx.ownerToken, requireApproval: true })
    const pending = await ctx.t.mutation(api.guestbook.submit, {
      pageId: ctx.id,
      authorName: "Анна",
      text: "Светлая память",
    })
    return { ...ctx, pendingId: pending.id }
  }

  it("lists messages with their effective status", async () => {
    const { t, ownerToken, pendingId } = await withMessages()
    const rows = await t.query(api.owner.listMessages, { token: ownerToken })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ _id: pendingId, status: "pending_owner", hiddenBy: null })
  })

  it("approves a pending message, publishing it", async () => {
    const { t, ownerToken, pendingId, id } = await withMessages()
    await t.mutation(api.owner.approveMessage, { token: ownerToken, messageId: pendingId })
    const published = await t.query(api.guestbook.list, { pageId: id, paginationOpts: { numItems: 10, cursor: null } })
    expect(published.page).toHaveLength(1)
    await expect(
      t.mutation(api.owner.approveMessage, { token: ownerToken, messageId: pendingId }),
    ).rejects.toThrow("не ожидает")
  })

  it("hides and restores only what it hid itself", async () => {
    const { t, ownerToken, pendingId } = await withMessages()
    await t.mutation(api.owner.approveMessage, { token: ownerToken, messageId: pendingId })
    await t.mutation(api.owner.hideMessage, { token: ownerToken, messageId: pendingId })
    const hidden = await t.run((ctx) => ctx.db.get(pendingId))
    expect(hidden).toMatchObject({ status: "hidden", hiddenBy: "owner" })

    await t.mutation(api.owner.restoreMessage, { token: ownerToken, messageId: pendingId })
    expect((await t.run((ctx) => ctx.db.get(pendingId)))?.status).toBe("published")
  })

  it("cannot restore a message the platform hid", async () => {
    const { t, ownerToken, pendingId } = await withMessages()
    await t.run((ctx) =>
      ctx.db.patch(pendingId, { status: "hidden", approved: false, hiddenBy: "platform", hiddenAt: Date.now() }),
    )
    await expect(
      t.mutation(api.owner.restoreMessage, { token: ownerToken, messageId: pendingId }),
    ).rejects.toThrow("скрытое вами")
  })

  it("cannot touch another page's message, even with a valid token", async () => {
    const { t } = await setup()
    const other = await setup.call(null) // unused, just to get a second page
    void other
    const a = await (await setup())
    const b = await setup()
    await expect(
      a.t.mutation(api.owner.hideMessage, { token: a.ownerToken, messageId: (await b.t.mutation(api.guestbook.submit, { pageId: b.id, authorName: "X", text: "Y" })).id }),
    ).rejects.toThrow("не найдено")
    void t
  })
})
