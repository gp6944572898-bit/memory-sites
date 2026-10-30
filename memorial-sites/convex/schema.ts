import { authTables } from "@convex-dev/auth/server"
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  ...authTables,

  pages: defineTable({
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
      v.literal("blocked"),
    ),
    // Status the page had right before an admin blocked it, so unblocking
    // restores exactly that state.
    statusBeforeBlock: v.optional(
      v.union(
        v.literal("active"),
        v.literal("reduced"),
        v.literal("pending_payment"),
      ),
    ),
    // Creator of the page. Optional: pages created before ownership existed
    // (or by signed-out visitors) have none. Informational only — actual
    // owner-panel access is governed by ownerToken below, not by sign-in,
    // since most creators never sign in at all.
    ownerId: v.optional(v.id("users")),
    // Secret token granting owner-panel access to this one page, generated
    // once at creation and shown to the creator then (never retrievable
    // again through any other query — that would let anyone who knows a
    // page's id steal control of it). Optional only so existing pages from
    // before this field existed keep working; they simply have no owner
    // access until one is issued by support.
    ownerToken: v.optional(v.string()),
    // Shown for the owner's own reference after they optionally save it; not
    // used for sign-in and not yet wired to actually send mail (no outbound
    // email sender is configured beyond the one-time sign-in code).
    ownerEmail: v.optional(v.string()),
    // Свой поддомен страницы (хранится строчными, уникален). Задаётся
    // владельцем через subdomain.claim.
    subdomain: v.optional(v.string()),
    requireApproval: v.boolean(),
    // Owner setting: send every new guestbook message to platform moderation
    // first (before the owner's own review, if that is on too).
    platformModeration: v.optional(v.boolean()),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerId"])
    .index("by_owner_token", ["ownerToken"])
    .index("by_subdomain", ["subdomain"]),

  // Admin-panel access. A user without a row here has no admin rights.
  adminRoles: defineTable({
    userId: v.id("users"),
    role: v.union(v.literal("main_admin"), v.literal("moderator")),
    grantedBy: v.optional(v.id("users")),
  }).index("by_user", ["userId"]),

  // Blocked accounts. A row = blocked; deleting the row = unblocked.
  userBlocks: defineTable({
    userId: v.id("users"),
    reason: v.optional(v.string()),
    blockedBy: v.optional(v.id("users")),
  }).index("by_user", ["userId"]),

  guestbookMessages: defineTable({
    pageId: v.id("pages"),
    authorName: v.string(),
    text: v.string(),
    // Kept in sync with `status` (approved === status is "published") so the
    // public reads keep working unchanged.
    approved: v.boolean(),
    // Moderation state. Old messages have none until backfilled; treat a
    // missing status as published/pending_owner according to `approved`.
    //   pending_platform — waits for platform moderators (comes first)
    //   pending_owner    — waits for the page owner
    //   published        — visible on the page
    //   hidden           — removed from view, kept until hiddenAt + retention
    status: v.optional(
      v.union(
        v.literal("pending_platform"),
        v.literal("pending_owner"),
        v.literal("published"),
        v.literal("hidden"),
      ),
    ),
    // Why the system held it for platform review (links / phone numbers).
    heldReason: v.optional(v.union(v.literal("link"), v.literal("phone"))),
    hiddenBy: v.optional(v.union(v.literal("owner"), v.literal("platform"))),
    hiddenReason: v.optional(v.string()),
    hiddenAt: v.optional(v.number()),
    // Anonymous per-browser key, only used to rate-limit posting.
    deviceKey: v.optional(v.string()),
    // Set when a complaint references this message: it is then never purged
    // automatically. (Complaints arrive in a later step.)
    complaintId: v.optional(v.string()),
  })
    .index("by_page", ["pageId"])
    .index("by_status", ["status"])
    .index("by_device", ["deviceKey"]),

  // Dynamic QR codes. The printed image encodes <public site address>/r/<code>;
  // what the code points at can be changed at any time without reprinting.
  qrCodes: defineTable({
    code: v.string(),
    // 8-digit number people can quote on the phone ("код 48213097"); shown in
    // the panel, searchable, and used in file names.
    numericId: v.optional(v.string()),
    // Last edit (target, name, on/off). Missing on codes created before this
    // field existed: fall back to the creation time.
    updatedAt: v.optional(v.number()),
    // Exactly one target: a memorial page, or an external address.
    pageId: v.optional(v.id("pages")),
    targetUrl: v.optional(v.string()),
    label: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("disabled")),
    scanCount: v.number(),
    lastScanAt: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_code", ["code"])
    .index("by_numeric", ["numericId"])
    .index("by_page", ["pageId"]),

  // Every time a code was pointed somewhere else: what it led to before and
  // after. Kept when the code itself is deleted, so a printed code can always
  // be traced. Targets are stored as readable text.
  qrHistory: defineTable({
    code: v.string(),
    numericId: v.optional(v.string()),
    label: v.optional(v.string()),
    oldTarget: v.string(),
    newTarget: v.string(),
    changedBy: v.optional(v.id("users")),
  }).index("by_code", ["code"]),

  // One row per scan. Deliberately holds no IP, device or other personal data.
  qrScans: defineTable({
    qrId: v.id("qrCodes"),
  }).index("by_qr", ["qrId"]),

  // Complaints about a page or a guestbook message, reported by any visitor.
  complaints: defineTable({
    targetType: v.union(v.literal("page"), v.literal("message")),
    pageId: v.id("pages"), // page itself, or the page the message belongs to
    messageId: v.optional(v.id("guestbookMessages")),
    reason: v.union(
      v.literal("spam"),
      v.literal("insult"),
      v.literal("personal_data"),
      v.literal("illegal"),
      v.literal("fake_info"),
      v.literal("other"),
    ),
    details: v.optional(v.string()),
    contact: v.optional(v.string()),
    deviceKey: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("resolved")),
    resolution: v.optional(
      v.union(
        v.literal("hidden"),
        v.literal("deleted"),
        v.literal("blocked"),
        v.literal("warned"),
        v.literal("dismissed"),
      ),
    ),
    resolvedBy: v.optional(v.id("users")),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_page", ["pageId"])
    .index("by_message", ["messageId"])
    .index("by_device", ["deviceKey"]),

  // Sticker marketplace catalog. Purchasing/display on public pages is a
  // later step; this table is the admin-managed catalog itself.
  stickers: defineTable({
    name: v.string(),
    imageUrl: v.string(),
    priceRub: v.number(),
    category: v.string(),
    active: v.boolean(),
    order: v.number(),
  })
    .index("by_category", ["category"])
    .index("by_order", ["order"]),

  // Epitaph phrases offered in the page-creation flow (replaces the fixed
  // list that used to live in the front-end code).
  epitaphTemplates: defineTable({
    text: v.string(),
    active: v.boolean(),
    order: v.number(),
  }).index("by_order", ["order"]),

  // Small key-value platform settings (e.g. the public site address).
  platformSettings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),

  // Who did what, across the admin panels. Content is never stored here (no
  // message text, no personal data beyond ids), so entries stay after a
  // message is deleted.
  moderationLog: defineTable({
    kind: v.union(
      v.literal("guestbook"),
      v.literal("user"),
      v.literal("page"),
      v.literal("admin_role"),
      v.literal("qr"),
      v.literal("content"),
    ),
    action: v.union(
      v.literal("approve"),
      v.literal("hide"),
      v.literal("restore"),
      v.literal("delete"),
      v.literal("auto_purge"),
      v.literal("block"),
      v.literal("unblock"),
      v.literal("grant_role"),
      v.literal("change_role"),
      v.literal("revoke_role"),
      v.literal("create"),
      v.literal("update"),
    ),
    targetId: v.string(),
    pageId: v.optional(v.id("pages")),
    actorId: v.optional(v.id("users")),
    reason: v.optional(v.string()),
  })
    .index("by_page", ["pageId"])
    .index("by_target", ["targetId"]),

  // Single unified campaign per page. For now the only campaign type is the
  // site buy-out (8900 RUB) — other campaign types (family support, charity)
  // are deferred.
  campaigns: defineTable({
    pageId: v.id("pages"),
    title: v.string(), // "Сбор средств на оплату сайта"
    description: v.optional(v.string()),
    goalRub: v.number(), // 8900
    collectedRub: v.number(), // sum of captured + currently-held contributions
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
    // Fixed deadline = createdAt + 7 days, set once at creation and never
    // extended by later contributions.
    deadlineAt: v.number(),
  }).index("by_page", ["pageId"]),

  contributions: defineTable({
    campaignId: v.id("campaigns"),
    amountRub: v.number(),
    donorName: v.optional(v.string()), // present even if anonymous, for records/receipts
    anonymous: v.boolean(),
    message: v.optional(v.string()),
    status: v.union(
      v.literal("held"),
      v.literal("captured"),
      v.literal("cancelled"),
    ),
    // Opaque token mailed/texted to the donor so they can cancel their own
    // contribution themselves while it's still "held".
    cancelToken: v.string(),
    // Populated once real YooKassa integration is wired in (payment id for
    // the two-stage hold on this contribution).
    yookassaPaymentId: v.optional(v.string()),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_cancel_token", ["cancelToken"]),
})
