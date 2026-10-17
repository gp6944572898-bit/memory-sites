import { getAuthUserId } from "@convex-dev/auth/server"
import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { SITE_PRICE_RUB } from "./campaigns"
import { isUserBlocked } from "./permissions"
import { generateOwnerToken } from "./ownerToken"

const SLUG_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789"

function generateSlug(): string {
  let slug = ""
  for (let i = 0; i < 8; i++) {
    slug += SLUG_CHARS[Math.floor(Math.random() * SLUG_CHARS.length)]
  }
  return slug
}

const pageValidator = v.object({
  _id: v.id("pages"),
  _creationTime: v.number(),
  slug: v.string(),
  fullName: v.string(),
  birthDate: v.string(),
  deathDate: v.string(),
  epitaph: v.string(),
  bioText: v.string(),
  mainPhotoUrl: v.optional(v.string()),
  photoAlbumUrls: v.optional(v.array(v.string())),
  videoUrl: v.optional(v.string()),
  burialLat: v.optional(v.number()),
  burialLng: v.optional(v.number()),
  status: v.union(
    v.literal("active"),
    v.literal("reduced"),
    v.literal("pending_payment"),
  ),
  requireApproval: v.boolean(),
})

const DEADLINE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export const create = mutation({
  args: {
    fullName: v.string(),
    birthDate: v.string(),
    deathDate: v.string(),
    epitaph: v.string(),
    bioText: v.string(),
    mainPhotoUrl: v.optional(v.string()),
    photoAlbumUrls: v.optional(v.array(v.string())),
    videoUrl: v.optional(v.string()),
    burialLat: v.optional(v.number()),
    burialLng: v.optional(v.number()),
  },
  returns: v.object({ id: v.id("pages"), slug: v.string(), ownerToken: v.string() }),
  handler: async (ctx, args) => {
    const fullName = args.fullName.trim()
    if (!fullName) throw new Error("Full name is required")

    // Remember who created the page (signed-out visitors have no owner) and
    // keep blocked accounts from creating new ones.
    const ownerId = (await getAuthUserId(ctx)) ?? undefined
    if (ownerId && (await isUserBlocked(ctx, ownerId))) {
      throw new Error("Ваш аккаунт заблокирован")
    }

    let slug = generateSlug()
    const existing = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique()
    if (existing) slug = generateSlug()
    const ownerToken = generateOwnerToken()

    const id = await ctx.db.insert("pages", {
      slug,
      ownerToken,
      fullName,
      birthDate: args.birthDate,
      deathDate: args.deathDate,
      epitaph: args.epitaph,
      bioText: args.bioText,
      mainPhotoUrl: args.mainPhotoUrl,
      photoAlbumUrls: args.photoAlbumUrls,
      videoUrl: args.videoUrl,
      burialLat: args.burialLat,
      burialLng: args.burialLng,
      status: "pending_payment",
      ownerId,
      requireApproval: false,
    })

    await ctx.db.insert("campaigns", {
      pageId: id,
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

    return { id, slug, ownerToken }
  },
})

export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(pageValidator, v.null()),
  handler: async (ctx, { slug }) => {
    const page = await ctx.db
      .query("pages")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique()
    // Blocked pages are hidden from the public; admins read them through the
    // admin functions instead.
    if (!page) return null
    const status = page.status
    if (status === "blocked") return null
    // Internal bookkeeping fields never leave the backend.
    const {
      ownerId: _ownerId,
      statusBeforeBlock: _before,
      ownerToken: _ownerToken,
      ownerEmail: _ownerEmail,
      ...publicPage
    } = page
    return { ...publicPage, status }
  },
})
