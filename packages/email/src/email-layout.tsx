import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "react-email"
import type { CSSProperties, ReactNode } from "react"

import { ASTREEX_BRAND, normalizeAstreexUrl } from "./shared"

export type EmailLayoutProps = {
  astreexUrl: string
  children: ReactNode
  preview: string
  title: string
}

export const colors = {
  accent: "#1d4ed8",
  accentDark: "#93c5fd",
  background: "#f8fafc",
  backgroundDark: "#0f172a",
  border: "#cbd5e1",
  borderDark: "#475569",
  card: "#ffffff",
  cardDark: "#1e293b",
  muted: "#475569",
  mutedDark: "#cbd5e1",
  text: "#0f172a",
  textDark: "#f8fafc",
} as const

export const fontFamily =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

const bodyStyle: CSSProperties = {
  backgroundColor: colors.background,
  color: colors.text,
  fontFamily,
  margin: 0,
  padding: "32px 12px",
}

const containerStyle: CSSProperties = {
  backgroundColor: colors.card,
  border: `1px solid ${colors.border}`,
  borderRadius: "8px",
  margin: "0 auto",
  maxWidth: "600px",
  padding: "32px",
}

const brandStyle: CSSProperties = {
  color: colors.text,
  fontSize: "16px",
  fontWeight: 700,
  letterSpacing: "0.02em",
  lineHeight: "24px",
  margin: "0 0 24px",
}

const titleStyle: CSSProperties = {
  color: colors.text,
  fontSize: "28px",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  lineHeight: "36px",
  margin: "0 0 20px",
}

const dividerStyle: CSSProperties = {
  borderColor: colors.border,
  margin: "32px 0 20px",
}

const footerStyle: CSSProperties = {
  color: colors.muted,
  fontSize: "13px",
  lineHeight: "20px",
  margin: 0,
}

const footerLinkStyle: CSSProperties = {
  color: colors.accent,
  textDecoration: "underline",
}

const colorSchemeStyles = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .email-body { background-color: ${colors.backgroundDark} !important; color: ${colors.textDark} !important; }
    .email-body > table > tbody > tr > td { background-color: ${colors.backgroundDark} !important; color: ${colors.textDark} !important; }
    .email-card { background-color: ${colors.cardDark} !important; border-color: ${colors.borderDark} !important; }
    .email-text { color: ${colors.textDark} !important; }
    .email-muted { color: ${colors.mutedDark} !important; }
    .email-border { border-color: ${colors.borderDark} !important; }
    .email-info { background-color: #172554 !important; }
    .email-danger { background-color: #450a0a !important; }
    .email-subtle { background-color: ${colors.backgroundDark} !important; }
    .email-link { color: ${colors.accentDark} !important; }
  }
`

export function EmailLayout({
  astreexUrl,
  children,
  preview,
  title,
}: EmailLayoutProps) {
  const safeAstreexUrl = normalizeAstreexUrl(astreexUrl)

  return (
    <Html lang="en">
      <Head>
        <meta content="light dark" name="color-scheme" />
        <meta content="light dark" name="supported-color-schemes" />
        <style>{colorSchemeStyles}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body className="email-body" style={bodyStyle}>
        <Container className="email-card" style={containerStyle}>
          <Text className="email-text" style={brandStyle}>
            {ASTREEX_BRAND}
          </Text>
          <Heading as="h1" className="email-text" style={titleStyle}>
            {title}
          </Heading>
          <Section>{children}</Section>
          <Hr className="email-border" style={dividerStyle} />
          <Text className="email-muted" style={footerStyle}>
            This email was sent by {ASTREEX_BRAND}. You can review your account
            in{" "}
            <Link
              className="email-link"
              href={safeAstreexUrl}
              style={footerLinkStyle}
            >
              Astreex
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
