import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { requireCapability } from "./permissions"

export const SITE_PRICE_RUB = 8900
const DEADLINE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let token = ""
  for (let i = 0; i < 24; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}

const campaignValidator = v.object({
  _id: v.id("campaigns"),
  _creationTime: v.number(),
  pageId: v.id("pages"),
  title: v.string(),
  description: v.optional(v.string()),
  goalRub: v.number(),
  collectedRub: v.number(),
  participantsCount: v.number(),
  whoCanParticipate: v.union(v.literal("anyone"), v.literal("invited")),
  showNames: v.boolean(),
  showAmounts: v.boolean(),
  allowAnonymous: v.boolean(),
  status: v.union(
    v.literal("active"),
    v.literal("completed"),
    v.literal("expired"),
  ),
  deadlineAt: v.number(),
})

// Creates the single site-buyout campaign for a freshly created page.
export const createForPage = mutation({
  args: { pageId: v.id("pages") },
  returns: v.id("campaigns"),
  handler: async (ctx, { pageId }) => {
    const existing = await ctx.db
      .query("campaigns")
      .withIndex("by_page", (q) => q.eq("pageId", pageId))
      .unique()
    if (existing) return existing._id

    return await ctx.db.insert("campaigns", {
      pageId,
      title: "Сбор средств на оплату сайта",
      description:
        "Пока сумма не набрана, страница памяти доступна в полном объёме. Если сбор не завершится к сроку — все взносы будут возвращены участникам.",
      goalRub: SITE_PRICE_RUB,
      collectedRub: 0,
      participantsCount: 0,
      whoCanParticipate: "anyone",
      showNames: true,
      showAmounts: true,
      allowAnonymous: true,
      status: "active",
      deadlineAt: Date.now() + DEADLINE_WINDOW_MS,
    })
  },
})

async function expireIfPastDeadline(
  ctx: { db: any },
  campaign: NonNullable<Awaited<ReturnType<any>>>,
) {
  if (campaign.status !== "active" || Date.now() < campaign.deadlineAt) {
    return campaign
  }
  const held = await ctx.db
    .query("contributions")
    .withIndex("by_campaign", (q: any) => q.eq("campaignId", campaign._id))
    .filter((q: any) => q.eq(q.field("status"), "held"))
    .collect()
  for (const c of held) {
    await ctx.db.patch(c._id, { status: "cancelled" })
  }
  await ctx.db.patch(campaign._id, {
    status: "expired",
    collectedRub: 0,
  })
  return await ctx.db.get(campaign._id)
}

export const getByPage = query({
  args: { pageId: v.id("pages") },
  returns: v.union(campaignValidator, v.null()),
  handler: async (ctx, { pageId }) => {
    const page = await ctx.db.get(pageId)
    if (!page || page.status === "blocked") return null
    const campaign = await ctx.db
      .query("campaigns")
      .withIndex("by_page", (q) => q.eq("pageId", pageId))
      .unique()
    if (!campaign) return null
    // Read-time lazy expiry check (actual sweep also runs on a cron — see crons.ts)
    if (campaign.status === "active" && Date.now() >= campaign.deadlineAt) {
      return campaign // real flip happens via the cron sweep to avoid mutating in a query
    }
    return campaign
  },
})

export const contribute = mutation({
  args: {
    campaignId: v.id("campaigns"),
    amountRub: v.number(),
    donorName: v.optional(v.string()),
    anonymous: v.boolean(),
    message: v.optional(v.string()),
  },
  returns: v.object({ contributionId: v.id("contributions"), cancelToken: v.string() }),
  handler: async (ctx, args) => {
    if (args.amountRub <= 0) throw new Error("Сумма взноса должна быть больше нуля")

    let campaign = await ctx.db.get(args.campaignId)
    if (!campaign) throw new Error("Сбор не найден")
    const campaignPage = await ctx.db.get(campaign.pageId)
    if (!campaignPage || campaignPage.status === "blocked") {
      throw new Error("Страница недоступна")
    }
    campaign = await expireIfPastDeadline(ctx, campaign)
    if (!campaign || campaign.status !== "active") {
      throw new Error("Сбор уже завершён")
    }

    const cancelToken = generateToken()
    const contributionId = await ctx.db.insert("contributions", {
      campaignId: args.campaignId,
      amountRub: args.amountRub,
      donorName: args.donorName?.trim() || undefined,
      anonymous: args.anonymous,
      message: args.message?.trim() || undefined,
      status: "held",
      cancelToken,
    })

    const newCollected = campaign.collectedRub + args.amountRub
    await ctx.db.patch(campaign._id, {
      collectedRub: newCollected,
      participantsCount: campaign.participantsCount + 1,
    })

    if (newCollected >= campaign.goalRub) {
      const held = await ctx.db
        .query("contributions")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
        .filter((q) => q.eq(q.field("status"), "held"))
        .collect()
      for (const c of held) {
        await ctx.db.patch(c._id, { status: "captured" })
      }
      await ctx.db.patch(campaign._id, { status: "completed" })
      const page = await ctx.db.get(campaign.pageId)
      if (page && page.status === "pending_payment") {
        await ctx.db.patch(page._id, { status: "active" })
      }
    }

    return { contributionId, cancelToken }
  },
})

// Donor cancels their own contribution via their personal link, while it's
// still held (before capture and before the campaign deadline).
export const cancelByToken = mutation({
  args: { cancelToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { cancelToken }) => {
    const contribution = await ctx.db
      .query("contributions")
      .withIndex("by_cancel_token", (q) => q.eq("cancelToken", cancelToken))
      .unique()
    if (!contribution) throw new Error("Взнос не найден")
    if (contribution.status !== "held") {
      throw new Error("Этот взнос уже нельзя отменить")
    }
    const campaign = await ctx.db.get(contribution.campaignId)
    if (!campaign) throw new Error("Сбор не найден")

    await ctx.db.patch(contribution._id, { status: "cancelled" })
    await ctx.db.patch(campaign._id, {
      collectedRub: Math.max(0, campaign.collectedRub - contribution.amountRub),
      participantsCount: Math.max(0, campaign.participantsCount - 1),
    })
    return null
  },
})

// Main-admin-only manual cancel for support/moderation cases (e.g. donor lost
// their personal link).
export const adminCancelContribution = mutation({
  args: { contributionId: v.id("contributions") },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    await requireCapability(ctx, "finance.manage")
    const contribution = await ctx.db.get(contributionId)
    if (!contribution) throw new Error("Взнос не найден")
    if (contribution.status !== "held") {
      throw new Error("Этот взнос уже нельзя отменить")
    }
    const campaign = await ctx.db.get(contribution.campaignId)
    if (!campaign) throw new Error("Сбор не найден")

    await ctx.db.patch(contribution._id, { status: "cancelled" })
    await ctx.db.patch(campaign._id, {
      collectedRub: Math.max(0, campaign.collectedRub - contribution.amountRub),
      participantsCount: Math.max(0, campaign.participantsCount - 1),
    })
    return null
  },
})

// Called by the hourly cron (see crons.ts) to sweep any campaign whose
// deadline has passed without reaching its goal.
export const sweepExpiredCampaigns = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now()
    const active = await ctx.db
      .query("campaigns")
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect()
    for (const campaign of active) {
      if (now < campaign.deadlineAt) continue
      const held = await ctx.db
        .query("contributions")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
        .filter((q) => q.eq(q.field("status"), "held"))
        .collect()
      for (const c of held) {
        await ctx.db.patch(c._id, { status: "cancelled" })
      }
      await ctx.db.patch(campaign._id, { status: "expired", collectedRub: 0 })
    }
    return null
  },
})

export const listContributions = query({
  args: { campaignId: v.id("campaigns") },
  returns: v.array(
    v.object({
      _id: v.id("contributions"),
      amountRub: v.number(),
      donorName: v.optional(v.string()),
      anonymous: v.boolean(),
      message: v.optional(v.string()),
      status: v.union(v.literal("held"), v.literal("captured"), v.literal("cancelled")),
      _creationTime: v.number(),
    }),
  ),
  handler: async (ctx, { campaignId }) => {
    const campaign = await ctx.db.get(campaignId)
    const page = campaign ? await ctx.db.get(campaign.pageId) : null
    if (!page || page.status === "blocked") return []
    const contributions = await ctx.db
      .query("contributions")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
      .order("desc")
      .collect()
    return contributions
      .filter((c: any) => c.status !== "cancelled")
      .map((c: any) => ({
        _id: c._id,
        amountRub: c.amountRub,
        donorName: c.anonymous ? undefined : c.donorName,
        anonymous: c.anonymous,
        message: c.message,
        status: c.status,
        _creationTime: c._creationTime,
      }))
  },
})
