import { cronJobs } from "convex/server"

import { dispatchPendingCreemBillingEventsReference } from "./billing/internal"
import { dispatchDueCategorizationJobsReference } from "./categorization/internal"
import { dispatchDueAccountDeletionsReference } from "./deletion/internal"
import { dispatchDueDailyDigestsReference } from "./digest/internal"
import { dispatchPendingEmailsReference } from "./email/internal"
import { dispatchDueTrackingSourcesReference } from "./scheduling/internal"

const crons = cronJobs()

crons.interval(
  "dispatch durable account deletions",
  { minutes: 1 },
  dispatchDueAccountDeletionsReference,
  {},
)

crons.interval(
  "retry persisted Creem billing events",
  { minutes: 1 },
  dispatchPendingCreemBillingEventsReference,
  {},
)

crons.interval(
  "dispatch persisted tracking schedules",
  { minutes: 1 },
  dispatchDueTrackingSourcesReference,
  {},
)

crons.interval(
  "dispatch mention categorization jobs",
  { minutes: 1 },
  dispatchDueCategorizationJobsReference,
  {},
)

crons.interval(
  "dispatch daily digest schedules",
  { minutes: 1 },
  dispatchDueDailyDigestsReference,
  {},
)

crons.interval(
  "dispatch durable email outbox",
  { minutes: 1 },
  dispatchPendingEmailsReference,
  {},
)

export default crons
