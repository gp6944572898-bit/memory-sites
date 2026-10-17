// Dashboard numbers for the admin panels. Everyone with page access sees the
// counts; money figures are included only for roles that may manage finance
// (otherwise `finance` is null).
//
// NOTE: reads whole tables — fine at MVP scale; move to running counters when
// the platform grows.
import { v } from "convex/values"

import { query } from "./_generated/server"
import { hasCapability, requireCapability } from "./permissions"

export const get = query({
  args: { periodDays: v.number() }, // 0 = all time
  returns: v.object({
    pages: v.object({
      total: v.number(),
      active: v.number(),
      pendingPayment: v.number(),
      reduced: v.number(),
      blocked: v.number(),
      createdInPeriod: v.number(),
    }),
    campaigns: v.object({
      active: v.number(),
      completed: v.number(),
      expired: v.number(),
    }),
    finance: v.union(
      v.null(),
      v.object({
        capturedRub: v.number(),
        heldRub: v.number(),
        contributionsInPeriod: v.number(),
      }),
    ),
  }),
  handler: async (ctx, { periodDays }) => {
    const admin = await requireCapability(ctx, "pages.view")
    const since = periodDays > 0 ? Date.now() - periodDays * 86_400_000 : 0

    const pages = await ctx.db.query("pages").collect()
    const countPages = (status: string) =>
      pages.filter((p) => p.status === status).length
    const campaigns = await ctx.db.query("campaigns").collect()
    const countCampaigns = (status: string) =>
      campaigns.filter((c) => c.status === status).length

    let finance: {
      capturedRub: number
      heldRub: number
      contributionsInPeriod: number
    } | null = null
    if (hasCapability(admin.role, "finance.manage")) {
      const contributions = await ctx.db.query("contributions").collect()
      const inPeriod = contributions.filter(
        (c) => c._creationTime >= since && c.status !== "cancelled",
      )
      finance = {
        capturedRub: inPeriod
          .filter((c) => c.status === "captured")
          .reduce((sum, c) => sum + c.amountRub, 0),
        heldRub: contributions
          .filter((c) => c.status === "held")
          .reduce((sum, c) => sum + c.amountRub, 0),
        contributionsInPeriod: inPeriod.length,
      }
    }

    return {
      pages: {
        total: pages.length,
        active: countPages("active"),
        pendingPayment: countPages("pending_payment"),
        reduced: countPages("reduced"),
        blocked: countPages("blocked"),
        createdInPeriod: pages.filter((p) => p._creationTime >= since).length,
      },
      campaigns: {
        active: countCampaigns("active"),
        completed: countCampaigns("completed"),
        expired: countCampaigns("expired"),
      },
      finance,
    }
  },
})
