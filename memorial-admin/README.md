# MemorialAdmin

Admin panel for the «Место памяти» platform (main admin and moderator roles).

## How it is wired

- **No backend of its own.** The app talks to the same database as the public
  site (MemorialSites). The connection URL is `VITE_DATA_CONVEX_URL` in
  `.env.local` (a public client URL, not a secret).
- Backend functions are referenced **by name** in `src/lib/backend.ts`. To add
  a screen: add the function in MemorialSites (`convex/…`, behind
  `requireCapability`), deploy it there, then add a reference here.
- Access is enforced by the backend on every call. `AdminGate` only decides
  what to show (sign-in, "no access", or the panel).
- Sign-in is a one-time code by e-mail. Phone and SSO (Sber ID, VK, Gosuslugi)
  are planned as extra providers.

## Sections

| Section | State |
|---|---|
| Дашборд | done |
| Страницы (filters, preview, block / unblock) | done |
| Книга памяти (queue, hidden, all; approve, hide, restore, delete) | done |
| QR-коды (create, retarget, disable, download, scan stats, history) | done |
| Пользователи, Админы | done |
| Стикеры и контент (sticker catalog, epitaph templates, theme toggles) | done |
| Жалобы (public report form on pages and messages; queue with hide / delete / block / warn / dismiss) | done |
| Сборы и платежи (campaign list, contributions, manual cancel) | done |

## QR codes

- A printed code encodes `<site address>/r/<CODE>`. The site's `/r/<CODE>` page
  (MemorialSites) resolves the code and sends the visitor to a memorial page or
  an external address, counting the scan. Changing the target never changes
  the picture.
- Settings match the old standalone QR service: error correction **L**, quiet
  zone **2** modules — fewest squares, largest engraving detail on stone, but
  tolerates only ~7% damage/dirt (vs ~15% at M, ~30% at H).
- The site address is set in this section. While it is a preview / development
  host, download for print is disabled. **Register the domain before printing.**

## Stickers, epitaphs, themes

- **Stickers**: admin-managed catalog (image via the site's existing upload
  pipeline, price, category, order, show/hide). Not yet wired into a purchase
  flow on the public site — this is the catalog only.
- **Epitaph templates**: replace the phrases that used to be hard-coded in the
  public create flow (`convex/content.ts:listEpitaphTemplates`, with the old
  phrases as a fallback if none are added yet).
- **Themes**: the public site ships two fixed visual themes (light/dark, coded
  in `src/components/memorial-preview.tsx`). This section only lets a main
  admin enable/disable which of the two are offered when creating a page — at
  least one must stay on. A fully custom, admin-designed theme is a separate,
  larger project (color tokens, layout), not built here.

## Moving to your own server

Only `VITE_DATA_CONVEX_URL` (and the auth provider settings on the backend
side) change. The code has no other ties to Macaly or to a specific host.

## Complaints

- Any visitor can report a page or a guestbook message (no sign-in): reason,
  optional comment and contact, rate-limited per browser.
- Reactions reuse the normal moderation actions (page block, message hide /
  delete) — one place that does each, not two. A message with a complaint is
  never auto-purged after 90 days.
- **"Warn" is only a record** for now: there is no owner panel or notification
  channel, so nothing is delivered to the page owner. It becomes a real
  message once the owner panel exists.
