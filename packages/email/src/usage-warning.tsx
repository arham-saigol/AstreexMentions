import { getPlanDefinition, type PlanId } from "@astreex/domain"
import { Button, Section, Text } from "react-email"
import type { CSSProperties } from "react"

import { EmailLayout, colors } from "./email-layout"
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
  USAGE_WARNING_PERCENTAGE,
} from "./shared"

export type UsageWarningEmailProps = {
  astreexUrl: string
  currentUsage: number
  planId: PlanId
  recipientName?: string
  workspaceName?: string
}

const detailsStyle: CSSProperties = {
  backgroundColor: "#eff6ff",
  border: `1px solid ${colors.border}`,
  borderRadius: "6px",
  margin: "24px 0",
  padding: "16px 20px",
}

function workspaceContext(workspaceName?: string): string {
  const name = workspaceName?.trim()
  return name ? ` for ${name}` : ""
}

function assertWarningUsage(planId: PlanId, currentUsage: number): void {
  assertNonNegativeSafeInteger("currentUsage", currentUsage)
  const { monthlyMentionLimit } = getPlanDefinition(planId)
  const warningAt = Math.ceil(
    (monthlyMentionLimit * USAGE_WARNING_PERCENTAGE) / 100,
  )

  if (currentUsage < warningAt || currentUsage >= monthlyMentionLimit) {
    throw new RangeError(
      `currentUsage must be at least ${warningAt} and below ${monthlyMentionLimit} for an 80% warning`,
    )
  }
}

export function usageWarningSubject(planId: PlanId): string {
  const { name } = getPlanDefinition(planId)
  return `Astreex usage alert: 80% of your ${name} limit used`
}

export function UsageWarningEmail({
  astreexUrl,
  currentUsage,
  planId,
  recipientName,
  workspaceName,
}: UsageWarningEmailProps) {
  assertWarningUsage(planId, currentUsage)
  const safeAstreexUrl = normalizeAstreexUrl(astreexUrl)
  const plan = getPlanDefinition(planId)
  const details = planDetails(planId)
  const remaining = plan.monthlyMentionLimit - currentUsage
  const usagePercent = Math.floor(
    (currentUsage / plan.monthlyMentionLimit) * 100,
  )
  const context = workspaceContext(workspaceName)

  return (
    <EmailLayout
      astreexUrl={safeAstreexUrl}
      preview={`${formatInteger(remaining)} monthly mentions remain on your ${plan.name} plan.`}
      title="You have used 80% of your monthly mention limit"
    >
      <Text className="email-text" style={emailParagraphStyle}>
        {greeting(recipientName)}
      </Text>
      <Text className="email-text" style={emailParagraphStyle}>
        Your Astreex account{context} has used {formatInteger(currentUsage)} of{" "}
        {details.mentionLimit} monthly mentions ({usagePercent}%). You have{" "}
        {formatInteger(remaining)} mentions remaining in this billing period.
      </Text>
      <Section className="email-border email-info" style={detailsStyle}>
        <Text className="email-text" style={emailDetailsTextStyle}>
          <strong>{details.name} plan</strong>
        </Text>
        <Text className="email-text" style={emailDetailsTextStyle}>
          {details.price} · {details.mentionLimit} monthly mentions ·{" "}
          {details.keywordLimit} keywords
        </Text>
      </Section>
      <Text className="email-text" style={emailParagraphStyle}>
        Review your usage and plan before the remaining allowance is used.
      </Text>
      <Section style={emailButtonContainerStyle}>
        <Button href={safeAstreexUrl} style={emailPrimaryButtonStyle}>
          Review usage in Astreex
        </Button>
      </Section>
    </EmailLayout>
  )
}

export function renderUsageWarningEmail(
  props: UsageWarningEmailProps,
): Promise<RenderedEmail> {
  return renderEmail(
    usageWarningSubject(props.planId),
    <UsageWarningEmail {...props} />,
  )
}

export default UsageWarningEmail
