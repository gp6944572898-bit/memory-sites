# Backend map (convex/)

Shared by the public site (this app) and the admin app (MemorialAdmin).

| Module | What it does |
|---|---|
| `permissions.ts` | Roles (main_admin, moderator), the capability matrix, `requireCapability`. Every admin function goes through it. |
| `admin.ts` | `me`, `grantRoleByEmail` (console only), block/unblock user and page. |
| `adminDashboard.ts` | Dashboard numbers; money only for roles with `finance.manage`. |
| `adminPages.ts` | Page list with filters, page content for moderators. |
| `adminGuestbook.ts` | Memory-book moderation queue, approve / hide / restore / delete, daily purge. |
| `guestbook.ts` | Public memory book: `submit` (returns the resulting status), `add` (legacy), `list`. |
| `guestbookRules.ts` | Pure rules: link / phone holds, statuses, limits, retention. No database access. |
| `pages.ts`, `campaigns.ts` | Public pages and the site buy-out campaign. |

## Memory-book moderation flow

1. A new message goes to **platform moderation** if the owner turned on
   `pages.platformModeration` or the text contains a link / phone number.
2. After platform approval it goes to the **owner's own review** if
   `pages.requireApproval` is on; otherwise it is published.
3. Admins see every pending message, whichever step it waits at; owner-step
   messages older than 14 days are flagged overdue.
4. Hidden messages are kept 90 days (`HIDDEN_RETENTION_DAYS`), then purged by
   a daily cron, unless a complaint references them (`complaintId`).
5. Deleting removes the message; `moderationLog` keeps who / when / why, never
   the text.

## Rules of thumb

- Public functions never return moderation fields (`status`, `deviceKey`, …).
- Return types of existing public functions must stay backward-compatible
  (the deploy check refuses breaking changes) — add new functions instead.
- Deployment `notable-opossum-926` is the production database; the admin app
  connects to it through `VITE_DATA_CONVEX_URL`.
