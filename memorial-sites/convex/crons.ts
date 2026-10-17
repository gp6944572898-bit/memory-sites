import { cronJobs } from "convex/server"

import { api, internal } from "./_generated/api"

const crons = cronJobs()

crons.interval(
  "sweep expired fundraising campaigns",
  { hours: 1 },
  api.campaigns.sweepExpiredCampaigns,
)

// Hidden memory-book messages are removed after the retention period.
crons.daily(
  "purge expired hidden guestbook messages",
  { hourUTC: 3, minuteUTC: 0 },
  internal.adminGuestbook.purgeExpiredHidden,
)

export default crons
