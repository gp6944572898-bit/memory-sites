// Finance admin: list campaigns, open one with its contributions. Manual
// cancellation of a contribution stays in campaigns.ts (adminCancelContribution)
// — this module only reads.
import { v, type Infer } from "convex/values"

import { query } from "./_generated/server"
import { requireCapability } from "./permissions"

const MAX_ROWS = 200

const campaignStatusValidator = v.union(
  v.literal("active"),
  v.literal("completed"),
  v.literal("expired"),
)

const campaignRowValidator = v.object({
  _id: v.id("campaigns"),
  pageId: v.id("pages"),
  pageName: v.string(),
  pageSlug: v.string(),
  title: v.string(),
  goalRub: v.number(),
  collectedRub: v.number(),
  participantsCount: v.number(),
  status: campaignStatusValidator,
  deadlineAt: v.number(),
  createdAt: v.number(),
})

export const listCampaigns = query({
  args: {
    status: v.optional(campaignStatusValidator),
    search: v.optional(v.string()),
  },
  returns: v.object({ rows: v.array(campaignRowValidator), truncated: v.boolean() }),
  handler: async (ctx, { status, search }) => {
    await requireCapability(ctx, "finance.manage")
    const needle = search?.trim().toLowerCase()
    const all = await ctx.db.query("campaigns").order("desc").take(MAX_ROWS)
    const matching = all.filter((c) => !status || c.status === status)

    const rows: Array<Infer<typeof campaignRowValidator>> = []
    for (const c of matching) {
      const page = await ctx.db.get(c.pageId)
      const pageName = page?.fullName ?? "—"
      if (needle && !pageName.toLowerCase().includes(needle) && !c.title.toLowerCase().includes(needle)) {
        continue
      }
      rows.push({
        _id: c._id,
        pageId: c.pageId,
        pageName,
        pageSlug: page?.slug ?? "",
        title: c.title,
        goalRub: c.goalRub,
        collectedRub: c.collectedRub,
        participantsCount: c.participantsCount,
        status: c.status,
        deadlineAt: c.deadlineAt,
        createdAt: c._creationTime,
      })
    }
    return { rows, truncated: matching.length >= MAX_ROWS }
  },
})

export const getCampaign = query({
  args: { campaignId: v.id("campaigns") },
  returns: v.union(
    v.null(),
    v.object({
      campaign: campaignRowValidator,
      description: v.union(v.string(), v.null()),
      contributions: v.array(
        v.object({
          _id: v.id("contributions"),
          donorName: v.union(v.string(), v.null()),
          anonymous: v.boolean(),
          amountRub: v.number(),
          message: v.union(v.string(), v.null()),
          status: v.union(v.literal("held"), v.literal("captured"), v.literal("cancelled")),
          createdAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { campaignId }) => {
    await requireCapability(ctx, "finance.manage")
    const campaign = await ctx.db.get(campaignId)
    if (!campaign) return null
    const page = await ctx.db.get(campaign.pageId)
    const contributions = await ctx.db
      .query("contributions")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .order("desc")
      .collect()
    return {
      campaign: {
        _id: campaign._id,
        pageId: campaign.pageId,
        pageName: page?.fullName ?? "—",
        pageSlug: page?.slug ?? "",
        title: campaign.title,
        goalRub: campaign.goalRub,
        collectedRub: campaign.collectedRub,
        participantsCount: campaign.participantsCount,
        status: campaign.status,
        deadlineAt: campaign.deadlineAt,
        createdAt: campaign._creationTime,
      },
      description: campaign.description ?? null,
      contributions: contributions.map((c) => ({
        _id: c._id,
        donorName: c.anonymous ? null : (c.donorName ?? null),
        anonymous: c.anonymous,
        amountRub: c.amountRub,
        message: c.message ?? null,
        status: c.status,
        createdAt: c._creationTime,
      })),
    }
  },
})
