// Public side of dynamic QR codes: what a scan resolves to.
//
// The printed QR encodes <site address>/r/<code>. The site's /r/<code> page
// calls this, then sends the visitor on to the memorial page (or shows an
// external address for confirmation). Each successful scan is counted; no
// personal data is stored with it.
import { v } from "convex/values"

import { mutation } from "./_generated/server"
import { normalizeCode } from "./qrRules"

export const resolve = mutation({
  args: { code: v.string() },
  returns: v.union(
    v.null(),
    v.object({ kind: v.literal("page"), slug: v.string() }),
    v.object({ kind: v.literal("url"), url: v.string() }),
  ),
  handler: async (ctx, { code }) => {
    const normalized = normalizeCode(code)
    if (!normalized || normalized.length > 20) return null

    const qr = await ctx.db
      .query("qrCodes")
      .withIndex("by_code", (q) => q.eq("code", normalized))
      .unique()
    if (!qr || qr.status !== "active") return null

    let target:
      | { kind: "page"; slug: string }
      | { kind: "url"; url: string }
      | null = null
    if (qr.pageId) {
      const page = await ctx.db.get(qr.pageId)
      // A blocked or deleted page is not reachable through its QR either.
      if (!page || page.status === "blocked") return null
      target = { kind: "page", slug: page.slug }
    } else if (qr.targetUrl) {
      target = { kind: "url", url: qr.targetUrl }
    }
    if (!target) return null

    await ctx.db.insert("qrScans", { qrId: qr._id })
    await ctx.db.patch(qr._id, {
      scanCount: qr.scanCount + 1,
      lastScanAt: Date.now(),
    })
    return target
  },
})
