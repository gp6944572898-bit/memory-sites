// References to the shared MemorialSites backend, by function name.
//
// This app has no backend code of its own: it talks to the same Convex
// deployment as the public site (see VITE_DATA_CONVEX_URL). Referencing the
// functions by name keeps the two projects independent — no generated files
// are copied between them, and if the backend later moves to another server
// only the connection URL changes.
import { makeFunctionReference } from "convex/server"

export type AdminRole = "main_admin" | "moderator"

export type Me = {
  userId: string
  role: AdminRole
  capabilities: string[]
}

export type DashboardStats = {
  pages: {
    total: number
    active: number
    pendingPayment: number
    reduced: number
    blocked: number
    createdInPeriod: number
  }
  campaigns: { active: number; completed: number; expired: number }
  // null for roles that may not see money (moderators)
  finance: null | {
    capturedRub: number
    heldRub: number
    contributionsInPeriod: number
  }
}

export type PageStatus = "active" | "reduced" | "pending_payment" | "blocked"

export type PageRow = {
  _id: string
  slug: string
  fullName: string
  birthDate: string
  deathDate: string
  status: PageStatus
  createdAt: number
  // null unless the admin's role may see owners
  ownerEmail: string | null
  campaign: null | {
    status: "active" | "completed" | "expired"
    goalRub: number
    collectedRub: number
    participantsCount: number
    deadlineAt: number
  }
}

export type PageDetail = {
  _id: string
  slug: string
  fullName: string
  birthDate: string
  deathDate: string
  epitaph: string
  bioText: string
  mainPhotoUrl: string | null
  albumCount: number
  videoUrl: string | null
  burialLat: number | null
  burialLng: number | null
  status: PageStatus
  requireApproval: boolean
}

export type MessageStatus =
  | "pending_platform"
  | "pending_owner"
  | "published"
  | "hidden"

export type HideReason = "spam" | "insult" | "personal_data" | "illegal" | "other"

export type GuestbookTab = "queue" | "hidden" | "all"

export type GuestbookRow = {
  _id: string
  pageId: string
  pageName: string
  pageSlug: string
  authorName: string
  text: string
  status: MessageStatus
  heldReason: "link" | "phone" | null
  hiddenBy: "owner" | "platform" | null
  hiddenReason: string | null
  hiddenAt: number | null
  createdAt: number
  // waiting for the owner for more than 14 days
  overdue: boolean
}

export type QrTarget =
  | null // the page is gone: the code leads nowhere
  | {
      kind: "page"
      pageId: string
      pageName: string
      pageSlug: string
      pageBlocked: boolean
    }
  | { kind: "url"; url: string }

export type QrRow = {
  _id: string
  code: string
  // 8-digit number shown to people and used in file names
  numericId: string | null
  label: string | null
  status: "active" | "disabled"
  target: QrTarget
  scanCount: number
  lastScanAt: number | null
  createdAt: number
  updatedAt: number
}

export type QrHistoryItem = {
  _id: string
  code: string
  numericId: string | null
  label: string | null
  oldTarget: string
  newTarget: string
  changedAt: number
}

export type QrStats = {
  total: number
  lastScanAt: number | null
  perDay: Array<{ dayStart: number; count: number }>
}

export type QrSettings = {
  publicBaseUrl: string | null
  // true for preview / development hosts: do not print codes with it
  isTemporary: boolean
}

export type UserRow = {
  _id: string
  name: string | null
  email: string | null
  createdAt: number
  blocked: boolean
  adminRole: AdminRole | null
  pagesCount: number
}

export type UserProfile = {
  user: UserRow
  blockReason: string | null
  pages: Array<{
    _id: string
    slug: string
    fullName: string
    status: PageStatus
    createdAt: number
  }>
}

export type AdminRow = {
  userId: string
  name: string | null
  email: string | null
  role: AdminRole
  blocked: boolean
  grantedByEmail: string | null
  createdAt: number
}

export type Sticker = {
  _id: string
  _creationTime: number
  name: string
  imageUrl: string
  priceRub: number
  category: string
  active: boolean
  order: number
}

export type EpitaphTemplate = {
  _id: string
  _creationTime: number
  text: string
  active: boolean
  order: number
}

export type ThemeSetting = { id: "light" | "dark"; enabled: boolean }

export type ComplaintReason =
  | "spam"
  | "insult"
  | "personal_data"
  | "illegal"
  | "fake_info"
  | "other"

export type ComplaintResolution =
  | "hidden"
  | "deleted"
  | "blocked"
  | "warned"
  | "dismissed"

export type ComplaintTab = "open" | "resolved" | "all"

export type ComplaintRow = {
  _id: string
  targetType: "page" | "message"
  pageId: string
  pageName: string
  pageSlug: string
  pageStatus: string
  messageId: string | null
  // null when the message no longer exists
  messageText: string | null
  messageAuthor: string | null
  messageStatus: string | null
  reason: ComplaintReason
  details: string | null
  contact: string | null
  status: "open" | "resolved"
  resolution: ComplaintResolution | null
  createdAt: number
}

export type CampaignStatus = "active" | "completed" | "expired"

export type CampaignRow = {
  _id: string
  pageId: string
  pageName: string
  pageSlug: string
  title: string
  goalRub: number
  collectedRub: number
  participantsCount: number
  status: CampaignStatus
  deadlineAt: number
  createdAt: number
}

export type ContributionRow = {
  _id: string
  donorName: string | null
  anonymous: boolean
  amountRub: number
  message: string | null
  status: "held" | "captured" | "cancelled"
  createdAt: number
}

export const backend = {
  me: makeFunctionReference<"query", Record<string, never>, Me | null>(
    "admin:me",
  ),
  dashboard: makeFunctionReference<
    "query",
    { periodDays: number },
    DashboardStats
  >("adminDashboard:get"),
  pages: makeFunctionReference<
    "query",
    { status?: PageStatus; search?: string },
    { rows: PageRow[]; truncated: boolean }
  >("adminPages:list"),
  pageDetail: makeFunctionReference<
    "query",
    { pageId: string },
    PageDetail | null
  >("adminPages:get"),
  setPageBlocked: makeFunctionReference<
    "mutation",
    { pageId: string; blocked: boolean },
    null
  >("admin:setPageBlocked"),
  users: makeFunctionReference<
    "query",
    { search?: string },
    { rows: UserRow[]; truncated: boolean }
  >("adminUsers:list"),
  userProfile: makeFunctionReference<
    "query",
    { userId: string },
    UserProfile | null
  >("adminUsers:get"),
  setUserBlocked: makeFunctionReference<
    "mutation",
    { userId: string; blocked: boolean; reason?: string },
    null
  >("admin:setUserBlocked"),
  admins: makeFunctionReference<"query", Record<string, never>, AdminRow[]>(
    "adminAdmins:list",
  ),
  addAdmin: makeFunctionReference<
    "mutation",
    { userId: string; role: AdminRole },
    null
  >("adminAdmins:add"),
  setAdminRole: makeFunctionReference<
    "mutation",
    { userId: string; role: AdminRole },
    null
  >("adminAdmins:setRole"),
  removeAdmin: makeFunctionReference<"mutation", { userId: string }, null>(
    "adminAdmins:remove",
  ),
  qrList: makeFunctionReference<
    "query",
    { search?: string; limit?: number },
    { rows: QrRow[]; truncated: boolean; total: number }
  >("adminQr:list"),
  qrHistory: makeFunctionReference<
    "query",
    { search?: string; limit?: number },
    { items: QrHistoryItem[]; truncated: boolean; total: number }
  >("adminQr:history"),
  qrRemove: makeFunctionReference<"mutation", { qrId: string }, null>(
    "adminQr:remove",
  ),
  qrSettings: makeFunctionReference<"query", Record<string, never>, QrSettings>(
    "adminQr:getSettings",
  ),
  qrSetBaseUrl: makeFunctionReference<"mutation", { url: string }, string>(
    "adminQr:setBaseUrl",
  ),
  qrCreate: makeFunctionReference<
    "mutation",
    { pageId?: string; targetUrl?: string; label?: string },
    { _id: string; code: string; numericId: string }
  >("adminQr:create"),
  qrUpdate: makeFunctionReference<
    "mutation",
    {
      qrId: string
      pageId?: string
      targetUrl?: string
      label?: string
      status?: "active" | "disabled"
    },
    null
  >("adminQr:update"),
  qrStats: makeFunctionReference<
    "query",
    { qrId: string; days: number; tzOffsetMinutes: number },
    QrStats
  >("adminQr:stats"),
  campaigns: makeFunctionReference<
    "query",
    { status?: CampaignStatus; search?: string },
    { rows: CampaignRow[]; truncated: boolean }
  >("adminFinance:listCampaigns"),
  campaignDetail: makeFunctionReference<
    "query",
    { campaignId: string },
    { campaign: CampaignRow; description: string | null; contributions: ContributionRow[] } | null
  >("adminFinance:getCampaign"),
  cancelContribution: makeFunctionReference<
    "mutation",
    { contributionId: string },
    null
  >("campaigns:adminCancelContribution"),
  complaints: makeFunctionReference<
    "query",
    { tab: ComplaintTab; search?: string },
    { rows: ComplaintRow[]; truncated: boolean }
  >("adminComplaints:list"),
  resolveComplaint: makeFunctionReference<
    "mutation",
    {
      complaintId: string
      resolution: ComplaintResolution
      reason?: "spam" | "insult" | "personal_data" | "illegal" | "other"
    },
    null
  >("adminComplaints:resolve"),
  stickers: makeFunctionReference<"query", Record<string, never>, Sticker[]>(
    "adminContent:listStickers",
  ),
  createSticker: makeFunctionReference<
    "mutation",
    { name: string; imageUrl: string; priceRub: number; category: string },
    string
  >("adminContent:createSticker"),
  updateSticker: makeFunctionReference<
    "mutation",
    {
      stickerId: string
      name?: string
      imageUrl?: string
      priceRub?: number
      category?: string
      active?: boolean
    },
    null
  >("adminContent:updateSticker"),
  reorderSticker: makeFunctionReference<
    "mutation",
    { stickerId: string; direction: "up" | "down" },
    null
  >("adminContent:reorderSticker"),
  deleteSticker: makeFunctionReference<"mutation", { stickerId: string }, null>(
    "adminContent:deleteSticker",
  ),
  epitaphTemplates: makeFunctionReference<
    "query",
    Record<string, never>,
    EpitaphTemplate[]
  >("adminContent:listEpitaphTemplates"),
  createEpitaphTemplate: makeFunctionReference<
    "mutation",
    { text: string },
    string
  >("adminContent:createEpitaphTemplate"),
  updateEpitaphTemplate: makeFunctionReference<
    "mutation",
    { templateId: string; text?: string; active?: boolean },
    null
  >("adminContent:updateEpitaphTemplate"),
  reorderEpitaphTemplate: makeFunctionReference<
    "mutation",
    { templateId: string; direction: "up" | "down" },
    null
  >("adminContent:reorderEpitaphTemplate"),
  deleteEpitaphTemplate: makeFunctionReference<
    "mutation",
    { templateId: string },
    null
  >("adminContent:deleteEpitaphTemplate"),
  themeSettings: makeFunctionReference<
    "query",
    Record<string, never>,
    ThemeSetting[]
  >("adminContent:getThemeSettings"),
  setThemeEnabled: makeFunctionReference<
    "mutation",
    { theme: "light" | "dark"; enabled: boolean },
    null
  >("adminContent:setThemeEnabled"),
  createUpload: makeFunctionReference<
    "action",
    { filename: string; contentType: string; fileSize: number; visibility: "public" | "private" },
    { fileId: string; uploadUrl: string; method: "PUT"; headers: Record<string, string>; expiresAt: string; maxBytes: number }
  >("appFiles:createUpload"),
  finalizeUpload: makeFunctionReference<
    "action",
    { fileId: string },
    { url: string }
  >("appFiles:finalizePhotoUpload"),
  guestbook: makeFunctionReference<
    "query",
    { tab: GuestbookTab; search?: string },
    { rows: GuestbookRow[]; truncated: boolean }
  >("adminGuestbook:list"),
  approveMessage: makeFunctionReference<
    "mutation",
    { messageId: string },
    null
  >("adminGuestbook:approve"),
  hideMessage: makeFunctionReference<
    "mutation",
    { messageId: string; reason: HideReason },
    null
  >("adminGuestbook:hide"),
  restoreMessage: makeFunctionReference<
    "mutation",
    { messageId: string },
    null
  >("adminGuestbook:restore"),
  removeMessage: makeFunctionReference<
    "mutation",
    { messageId: string; reason: HideReason },
    null
  >("adminGuestbook:remove"),
}

export const ROLE_LABEL: Record<AdminRole, string> = {
  main_admin: "Главный админ",
  moderator: "Модератор",
}

export const PAGE_STATUS_LABEL: Record<PageStatus, string> = {
  active: "Активна",
  pending_payment: "В процессе выкупа",
  reduced: "Урезанная",
  blocked: "Заблокирована",
}

export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
  pending_platform: "Ждёт платформу",
  pending_owner: "Ждёт владельца",
  published: "Опубликовано",
  hidden: "Скрыто",
}

export const HIDE_REASON_LABEL: Record<HideReason, string> = {
  spam: "Спам",
  insult: "Оскорбление",
  personal_data: "Личные данные",
  illegal: "Нарушение закона",
  other: "Другое",
}

export const COMPLAINT_REASON_LABEL: Record<ComplaintReason, string> = {
  spam: "Спам или реклама",
  insult: "Оскорбление",
  personal_data: "Личные данные",
  illegal: "Незаконное содержание",
  fake_info: "Недостоверная информация",
  other: "Другое",
}

export const COMPLAINT_RESOLUTION_LABEL: Record<ComplaintResolution, string> = {
  hidden: "Сообщение скрыто",
  deleted: "Сообщение удалено",
  blocked: "Страница заблокирована",
  warned: "Вынесено предупреждение",
  dismissed: "Отклонена",
}

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  active: "Идёт сейчас",
  completed: "Собран",
  expired: "Истёк",
}
