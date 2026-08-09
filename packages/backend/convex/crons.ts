import { internal } from "./_generated/api"
import { cronJobs } from "convex/server"

const crons = cronJobs()

crons.interval(
  "dispatch durable account deletions",
  { minutes: 1 },
  internal.deletion.internal.dispatchDueAccountDeletions,
  {},
)

crons.interval(
  "retry persisted Creem billing events",
  { minutes: 1 },
  internal.billing.internal.dispatchPendingCreemBillingEvents,
  {},
)

crons.interval(
  "reconcile expired monitoring access",
  { minutes: 5 },
  internal.billing.accessReconciliation.reconcileExpiredMonitoringAccess,
  {},
)

crons.interval(
  "dispatch persisted tracking schedules",
  { minutes: 1 },
  internal.scheduling.internal.dispatchDueTrackingSources,
  {},
)

crons.interval(
  "dispatch mention categorization jobs",
  { minutes: 1 },
  internal.categorization.internal.dispatchDueCategorizationJobs,
  {},
)

crons.interval(
  "purge expired free evaluation mentions",
  { hours: 1 },
  internal.retention.purgeExpiredFreeMentions,
  {},
)

crons.interval(
  "dispatch daily digest schedules",
  { minutes: 1 },
  internal.digest.internal.dispatchDueDailyDigests,
  {},
)

crons.interval(
  "dispatch durable email outbox",
  { minutes: 1 },
  internal.email.internal.dispatchPendingEmails,
  {},
)

export default crons
