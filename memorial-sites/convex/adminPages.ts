// Page moderation for the admin panels: list every page on the platform with
// filters, and open one page's full content.
//
// Moderators may look at pages but not at who owns them — owner e-mails are
// personal data and only roles that manage users get them.
//
// NOTE: reads up to MAX_SCANNED newest pages and filters in memory — fine at
// MVP scale; switch to indexed/paginated queries when the platform grows.
import { v, type Infer } from "convex/values"

import { query } from "./_generated/server"
import { hasCapability, requireCapability } from "./permissions"

const MAX_SCANNED = 1000
const MAX_ROWS = 200

const statusValidator = v.union(
  v.literal("active"),
  v.literal("reduced"),
  v.literal("pending_payment"),
  v.literal("blocked"),
)

const rowValidator = v.object({
  _id: v.id("pages"),
  slug: v.string(),
  fullName: v.string(),
  birthDate: v.string(),
  deathDate: v.string(),
  status: statusValidator,
  createdAt: v.number(),
  ownerEmail: v.union(v.string(), v.null()),
  campaign: v.union(
    v.null(),
    v.object({
      status: v.union(
        v.literal("active"),
        v.literal("completed"),
        v.literal("expired"),
      ),
      goalRub: v.number(),
      collectedRub: v.number(),
      participantsCount: v.number(),
      deadlineAt: v.number(),
    }),
  ),
})

export const list = query({
  args: {
    status: v.optional(statusValidator),
    search: v.optional(v.string()),
  },
  returns: v.object({ rows: v.array(rowValidator), truncated: v.boolean() }),
  handler: async (ctx, { status, search }) => {
    const admin = await requireCapability(ctx, "pages.view")
    const canSeeOwners = hasCapability(admin.role, "users.manage")

    const needle = search?.trim().toLowerCase()
    const scanned = await ctx.db.query("pages").order("desc").take(MAX_SCANNED)
    const matching = scanned.filter(
      (p) =>
        (!status || p.status === status) &&
        (!needle ||
          p.fullName.toLowerCase().includes(needle) ||
          p.slug.toLowerCase().includes(needle)),
    )

    const rows: Array<Infer<typeof rowValidator>> = []
    for (const page of matching.slice(0, MAX_ROWS)) {
      const campaign = await ctx.db
        .query("campaigns")
        .withIndex("by_page", (q) => q.eq("pageId", page._id))
        .first()
      let ownerEmail: string | null = null
      if (canSeeOwners && page.ownerId) {
        ownerEmail = (await ctx.db.get(page.ownerId))?.email ?? null
      }
      rows.push({
        _id: page._id,
        slug: page.slug,
        fullName: page.fullName,
        birthDate: page.birthDate,
        deathDate: page.deathDate,
        status: page.status,
        createdAt: page._creationTime,
        ownerEmail,
        campaign: campaign
          ? {
              status: campaign.status,
              goalRub: campaign.goalRub,
              collectedRub: campaign.collectedRub,
              participantsCount: campaign.participantsCount,
              deadlineAt: campaign.deadlineAt,
            }
          : null,
      })
    }
    return { rows, truncated: matching.length > MAX_ROWS }
  },
})

// Full content of one page, so a moderator can judge it before acting.
export const get = query({
  args: { pageId: v.id("pages") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("pages"),
      slug: v.string(),
      fullName: v.string(),
      birthDate: v.string(),
      deathDate: v.string(),
      epitaph: v.string(),
      bioText: v.string(),
      mainPhotoUrl: v.union(v.string(), v.null()),
      albumCount: v.number(),
      videoUrl: v.union(v.string(), v.null()),
      burialLat: v.union(v.number(), v.null()),
      burialLng: v.union(v.number(), v.null()),
      status: statusValidator,
      requireApproval: v.boolean(),
    }),
  ),
  handler: async (ctx, { pageId }) => {
    await requireCapability(ctx, "pages.view")
    const page = await ctx.db.get(pageId)
    if (!page) return null
    return {
      _id: page._id,
      slug: page.slug,
      fullName: page.fullName,
      birthDate: page.birthDate,
      deathDate: page.deathDate,
      epitaph: page.epitaph,
      bioText: page.bioText,
      mainPhotoUrl: page.mainPhotoUrl ?? null,
      albumCount: page.photoAlbumUrls?.length ?? 0,
      videoUrl: page.videoUrl ?? null,
      burialLat: page.burialLat ?? null,
      burialLng: page.burialLng ?? null,
      status: page.status,
      requireApproval: page.requireApproval,
    }
  },
})
