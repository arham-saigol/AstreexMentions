import { HOUR, RateLimiter } from "@convex-dev/rate-limiter"

import { components } from "../_generated/api"

export const onboardingResearchRateLimiter = new RateLimiter(
  components.rateLimiter,
  {
    onboardingResearch: { kind: "fixed window", period: HOUR, rate: 3 },
  },
)
