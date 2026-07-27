import { getPlanDefinition, type PlanId } from "@astreex/domain"
import { Button, Section, Text } from "react-email"
import type { CSSProperties } from "react"

import { EmailLayout } from "./email-layout"
import {
  emailButtonContainerStyle,
  emailDetailsTextStyle,
  emailParagraphStyle,
  emailPrimaryButtonStyle,
} from "./email-styles"
import { renderEmail, type RenderedEmail } from "./render-email"
import {
  assertNonNegativeSafeInteger,
  formatInteger,
  greeting,
  normalizeAstreexUrl,
  planDetails,
} from "./shared"

export type LimitReachedEmailProps = {
  astreexUrl: string
  currentUsage: number
  planId: PlanId
  recipientName?: string
  workspaceName?: string
}

const detailsStyle: CSSProperties = {
  backgroundColor: "#fef2f2",
  border: "1px solid #fca5a5",
  borderRadius: "6px",
  margin: "24px 0",
  padding: "16px 20px",
}

function assertReachedUsage(planId: PlanId, currentUsage: number): void {
  assertNonNegativeSafeInteger("currentUsage", currentUsage)
  const { monthlyMentionLimit } = getPlanDefinition(planId)
  if (currentUsage < monthlyMentionLimit) {
    throw new RangeError(
      `currentUsage must be at least ${monthlyMentionLimit} for a limit-reached email`,
    )
  }
}

export function limitReachedSubject(planId: PlanId): string {
  const { name } = getPlanDefinition(planId)
  return `Astreex limit reached: ${name} monthly mentions`
}

export function LimitReachedEmail({
  astreexUrl,
  currentUsage,
  planId,
  recipientName,
  workspaceName,
}: LimitReachedEmailProps) {
  assertReachedUsage(planId, currentUsage)
  const safeAstreexUrl = normalizeAstreexUrl(astreexUrl)
  const plan = getPlanDefinition(planId)
  const details = planDetails(planId)
  const workspace = workspaceName?.trim()

  return (
    <EmailLayout
      astreexUrl={safeAstreexUrl}
      preview={`Your ${plan.name} plan has reached its ${details.mentionLimit}-mention monthly limit.`}
      title="Your monthly mention limit has been reached"
    >
      <Text className="email-text" style={emailParagraphStyle}>
        {greeting(recipientName)}
      </Text>
      <Text className="email-text" style={emailParagraphStyle}>
        {workspace ? `${workspace} has` : "Your Astreex account has"} recorded{" "}
        {formatInteger(currentUsage)} mentions this billing period and reached
        the {details.mentionLimit}-mention limit on the {details.name} plan.
      </Text>
      <Section className="email-border email-danger" style={detailsStyle}>
        <Text className="email-text" style={emailDetailsTextStyle}>
          <strong>100% of monthly allowance used</strong>
        </Text>
        <Text className="email-text" style={emailDetailsTextStyle}>
          {details.price} · {details.mentionLimit} monthly mentions ·{" "}
          {details.keywordLimit} keywords
        </Text>
      </Section>
      <Text className="email-text" style={emailParagraphStyle}>
        Review your account usage and plan options in Astreex.
      </Text>
      <Section style={emailButtonContainerStyle}>
        <Button href={safeAstreexUrl} style={emailPrimaryButtonStyle}>
          Review plan in Astreex
        </Button>
      </Section>
    </EmailLayout>
  )
}

export function renderLimitReachedEmail(
  props: LimitReachedEmailProps,
): Promise<RenderedEmail> {
  return renderEmail(
    limitReachedSubject(props.planId),
    <LimitReachedEmail {...props} />,
  )
}

export default LimitReachedEmail
