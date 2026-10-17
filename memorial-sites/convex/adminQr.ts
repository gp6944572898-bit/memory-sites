// QR codes for the admin panel: create, retarget, disable, delete, look at scan
// stats and the history of target changes, and set the public site address that
// gets printed inside every code.
//
// All functions need the `qr.manage` capability (main admin).
//
// NOTE: lists read up to MAX_SCANNED rows and filter / sort in memory — fine at
// MVP scale; move to indexed search when the number of codes grows.
import { v, type Infer } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { logAction } from "./auditLog"
import { requireCapability } from "./permissions"
import {
  bucketByDay,
  generateCode,
  generateNumericId,
  isTemporaryHost,
  normalizeBaseUrl,
  validateTargetUrl,
} from "./qrRules"

const MAX_SCANNED = 5000
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 200
const MAX_LABEL = 80
const SCANS_DELETED_WITH_CODE = 4000
const BASE_URL_KEY = "publicBaseUrl"

const rowValidator = v.object({
  _id: v.id("qrCodes"),
  code: v.string(),
  numericId: v.union(v.string(), v.null()),
  label: v.union(v.string(), v.null()),
  status: v.union(v.literal("active"), v.literal("disabled")),
  target: v.union(
    v.null(), // the page is gone: the code leads nowhere
    v.object({
      kind: v.literal("page"),
      pageId: v.id("pages"),
      pageName: v.string(),
      pageSlug: v.string(),
      pageBlocked: v.boolean(),
    }),
    v.object({ kind: v.literal("url"), url: v.string() }),
  ),
  scanCount: v.number(),
  lastScanAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const historyValidator = v.object({
  _id: v.id("qrHistory"),
  code: v.string(),
  numericId: v.union(v.string(), v.null()),
  label: v.union(v.string(), v.null()),
  oldTarget: v.string(),
  newTarget: v.string(),
  changedAt: v.number(),
})

function cleanLabel(label: string | undefined): string | undefined {
  const trimmed = label?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > MAX_LABEL) {
    throw new Error(`Название не длиннее ${MAX_LABEL} символов`)
  }
  return trimmed
}

function cleanLimit(limit: number | undefined): number {
  return Math.min(Math.max(Math.floor(limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT)
}

// Readable description of where a code leads, kept in the history.
async function describeTarget(
  ctx: QueryCtx | MutationCtx,
  qr: Pick<Doc<"qrCodes">, "pageId" | "targetUrl">,
): Promise<string> {
  if (qr.pageId) {
    const page = await ctx.db.get(qr.pageId)
    return page ? `Страница: ${page.fullName} (${page.slug})` : "Страница удалена"
  }
  return qr.targetUrl ?? ""
}

export const getSettings = query({
  args: {},
  returns: v.object({
    publicBaseUrl: v.union(v.string(), v.null()),
    // true for preview / development hosts: do not print codes with it
    isTemporary: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireCapability(ctx, "qr.manage")
    const row = await ctx.db
      .query("platformSettings")
      .withIndex("by_key", (q) => q.eq("key", BASE_URL_KEY))
      .unique()
    return {
      publicBaseUrl: row?.value ?? null,
      isTemporary: row ? isTemporaryHost(row.value) : true,
    }
  },
})

export const setBaseUrl = mutation({
  args: { url: v.string() },
  returns: v.string(),
  handler: async (ctx, { url }) => {
    await requireCapability(ctx, "qr.manage")
    const value = normalizeBaseUrl(url)
    const row = await ctx.db
      .query("platformSettings")
      .withIndex("by_key", (q) => q.eq("key", BASE_URL_KEY))
      .unique()
    if (row) await ctx.db.patch(row._id, { value })
    else await ctx.db.insert("platformSettings", { key: BASE_URL_KEY, value })
    return value
  },
})

// Most recently edited first. `limit` grows as the admin taps "show more";
// `truncated` means there are more to show, `total` is the number that match.
export const list = query({
  args: { search: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.object({
    rows: v.array(rowValidator),
    truncated: v.boolean(),
    total: v.number(),
  }),
  handler: async (ctx, { search, limit }) => {
    await requireCapability(ctx, "qr.manage")
    const codes = await ctx.db.query("qrCodes").order("desc").take(MAX_SCANNED)
    const needle = search?.trim().toLowerCase()

    const matching: Array<Infer<typeof rowValidator>> = []
    for (const qr of codes) {
      let target: Infer<typeof rowValidator>["target"] = null
      if (qr.pageId) {
        const page = await ctx.db.get(qr.pageId)
        if (page) {
          target = {
            kind: "page",
            pageId: page._id,
            pageName: page.fullName,
            pageSlug: page.slug,
            pageBlocked: page.status === "blocked",
          }
        }
      } else if (qr.targetUrl) {
        target = { kind: "url", url: qr.targetUrl }
      }

      if (needle) {
        const haystack = [
          qr.code,
          qr.numericId ?? "",
          qr.label ?? "",
          target?.kind === "page" ? target.pageName : "",
          target?.kind === "url" ? target.url : "",
        ]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(needle)) continue
      }

      matching.push({
        _id: qr._id,
        code: qr.code,
        numericId: qr.numericId ?? null,
        label: qr.label ?? null,
        status: qr.status,
        target,
        scanCount: qr.scanCount,
        lastScanAt: qr.lastScanAt ?? null,
        createdAt: qr._creationTime,
        updatedAt: qr.updatedAt ?? qr._creationTime,
      })
    }

    matching.sort((a, b) => b.updatedAt - a.updatedAt)
    const shown = cleanLimit(limit)
    return {
      rows: matching.slice(0, shown),
      truncated: matching.length > shown,
      total: matching.length,
    }
  },
})

export const create = mutation({
  args: {
    pageId: v.optional(v.id("pages")),
    targetUrl: v.optional(v.string()),
    label: v.optional(v.string()),
  },
  returns: v.object({
    _id: v.id("qrCodes"),
    code: v.string(),
    numericId: v.string(),
  }),
  handler: async (ctx, args) => {
    const admin = await requireCapability(ctx, "qr.manage")
    if (!args.pageId === !args.targetUrl) {
      throw new Error("Укажите либо страницу, либо внешний адрес")
    }
    let targetUrl: string | undefined
    if (args.pageId) {
      if (!(await ctx.db.get(args.pageId))) throw new Error("Страница не найдена")
    } else {
      targetUrl = validateTargetUrl(args.targetUrl!)
    }

    let code = ""
    for (let attempt = 0; attempt < 10 && !code; attempt++) {
      const candidate = generateCode()
      const clash = await ctx.db
        .query("qrCodes")
        .withIndex("by_code", (q) => q.eq("code", candidate))
        .first()
      if (!clash) code = candidate
    }
    if (!code) throw new Error("Не удалось подобрать код, повторите")

    let numericId = ""
    for (let attempt = 0; attempt < 10 && !numericId; attempt++) {
      const candidate = generateNumericId()
      const clash = await ctx.db
        .query("qrCodes")
        .withIndex("by_numeric", (q) => q.eq("numericId", candidate))
        .first()
      if (!clash) numericId = candidate
    }
    if (!numericId) throw new Error("Не удалось подобрать номер, повторите")

    const _id = await ctx.db.insert("qrCodes", {
      code,
      numericId,
      pageId: args.pageId,
      targetUrl,
      label: cleanLabel(args.label),
      status: "active",
      scanCount: 0,
      updatedAt: Date.now(),
      createdBy: admin.userId,
    })
    return { _id, code, numericId }
  },
})

// Change where a printed code leads, rename it, or switch it off / on. The
// code itself never changes — that is the point of a dynamic QR. A change of
// destination is written to the history.
export const update = mutation({
  args: {
    qrId: v.id("qrCodes"),
    pageId: v.optional(v.id("pages")),
    targetUrl: v.optional(v.string()),
    label: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("disabled"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireCapability(ctx, "qr.manage")
    const qr = await ctx.db.get(args.qrId)
    if (!qr) throw new Error("Код не найден")
    if (args.pageId && args.targetUrl) {
      throw new Error("Укажите либо страницу, либо внешний адрес")
    }

    const patch: {
      pageId?: typeof args.pageId
      targetUrl?: string
      label?: string
      status?: "active" | "disabled"
      updatedAt: number
    } = { updatedAt: Date.now() }
    if (args.pageId) {
      if (!(await ctx.db.get(args.pageId))) throw new Error("Страница не найдена")
      patch.pageId = args.pageId
      patch.targetUrl = undefined
    } else if (args.targetUrl) {
      patch.targetUrl = validateTargetUrl(args.targetUrl)
      patch.pageId = undefined
    }
    if (args.label !== undefined) patch.label = cleanLabel(args.label)
    if (args.status) patch.status = args.status

    const sameTarget =
      (patch.pageId === undefined && patch.targetUrl === undefined) ||
      (patch.pageId !== undefined && patch.pageId === qr.pageId) ||
      (patch.targetUrl !== undefined && patch.targetUrl === qr.targetUrl)

    const oldTarget = await describeTarget(ctx, qr)
    await ctx.db.patch(args.qrId, patch)
    if (!sameTarget) {
      const after = (await ctx.db.get(args.qrId))!
      await ctx.db.insert("qrHistory", {
        code: qr.code,
        numericId: qr.numericId,
        label: after.label,
        oldTarget,
        newTarget: await describeTarget(ctx, after),
        changedBy: admin.userId,
      })
    }
    return null
  },
})

// Deletes the code for good: whatever is printed with it stops working. The
// history of its changes stays. Prefer "disable" when in doubt — it can be
// undone.
export const remove = mutation({
  args: { qrId: v.id("qrCodes") },
  returns: v.null(),
  handler: async (ctx, { qrId }) => {
    const admin = await requireCapability(ctx, "qr.manage")
    const qr = await ctx.db.get(qrId)
    if (!qr) throw new Error("Код не найден")

    const scans = await ctx.db
      .query("qrScans")
      .withIndex("by_qr", (q) => q.eq("qrId", qrId))
      .take(SCANS_DELETED_WITH_CODE)
    for (const scan of scans) await ctx.db.delete(scan._id)
    await ctx.db.delete(qrId)
    await logAction(ctx, {
      kind: "qr",
      action: "delete",
      targetId: qr.code,
      actorId: admin.userId,
    })
    return null
  },
})

export const history = query({
  args: { search: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.object({
    items: v.array(historyValidator),
    truncated: v.boolean(),
    total: v.number(),
  }),
  handler: async (ctx, { search, limit }) => {
    await requireCapability(ctx, "qr.manage")
    const entries = await ctx.db.query("qrHistory").order("desc").take(MAX_SCANNED)
    const needle = search?.trim().toLowerCase()
    const matching = entries.filter(
      (h) =>
        !needle ||
        [h.code, h.numericId ?? "", h.label ?? "", h.oldTarget, h.newTarget]
          .join(" ")
          .toLowerCase()
          .includes(needle),
    )
    const shown = cleanLimit(limit)
    return {
      items: matching.slice(0, shown).map((h) => ({
        _id: h._id,
        code: h.code,
        numericId: h.numericId ?? null,
        label: h.label ?? null,
        oldTarget: h.oldTarget,
        newTarget: h.newTarget,
        changedAt: h._creationTime,
      })),
      truncated: matching.length > shown,
      total: matching.length,
    }
  },
})

export const stats = query({
  args: {
    qrId: v.id("qrCodes"),
    days: v.number(),
    // minutes east of UTC, e.g. Moscow = 180
    tzOffsetMinutes: v.number(),
  },
  returns: v.object({
    total: v.number(),
    lastScanAt: v.union(v.number(), v.null()),
    perDay: v.array(v.object({ dayStart: v.number(), count: v.number() })),
  }),
  handler: async (ctx, { qrId, days, tzOffsetMinutes }) => {
    await requireCapability(ctx, "qr.manage")
    const qr = await ctx.db.get(qrId)
    if (!qr) throw new Error("Код не найден")
    const span = Math.min(Math.max(Math.floor(days), 1), 90)
    const now = Date.now()
    const since = now - (span + 1) * 86_400_000
    const scans = await ctx.db
      .query("qrScans")
      .withIndex("by_qr", (q) => q.eq("qrId", qrId).gte("_creationTime", since))
      .take(10_000)
    return {
      total: qr.scanCount,
      lastScanAt: qr.lastScanAt ?? null,
      perDay: bucketByDay(
        scans.map((s) => s._creationTime),
        now,
        span,
        tzOffsetMinutes,
      ),
    }
  },
})
