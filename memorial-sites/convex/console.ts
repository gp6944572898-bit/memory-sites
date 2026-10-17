// Console-only counterpart of adminQr.setBaseUrl, for when no admin session
// is available (initial setup, CLI operations). Not reachable by any client.
import { v } from "convex/values"

import { internalMutation } from "./_generated/server"
import { normalizeBaseUrl } from "./qrRules"

const BASE_URL_KEY = "publicBaseUrl"

export const setBaseUrlFromConsole = internalMutation({
  args: { url: v.string() },
  returns: v.string(),
  handler: async (ctx, { url }) => {
    const value = normalizeBaseUrl(url)
    const row = await ctx.db
      .query("platformSettings")
      .withIndex("by_key", (q) => q.eq("key", BASE_URL_KEY))
      .unique()
    if (row) await ctx.db.patch(row._id, { value })
    else await ctx.db.insert("platformSettings", { key: BASE_URL_KEY, value })
    return value
  },
})
