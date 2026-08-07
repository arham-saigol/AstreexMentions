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
  accent: "#1b1a18",
  accentSoft: "#f4eadb",
  background: "#f7f6f3",
  border: "#eaeaea",
  borderStrong: "#d6d4ce",
  card: "#ffffff",
  muted: "#787774",
  secondary: "#4a4843",
  text: "#1b1a18",
} as const

export const fontFamily =
  "'Geist', 'Helvetica Neue', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
export const displayFontFamily =
  "'Newsreader', Georgia, 'Times New Roman', serif"
export const monoFontFamily =
  "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace"

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
  padding: "28px",
}

const brandStyle: CSSProperties = {
  color: colors.text,
  fontFamily: displayFontFamily,
  fontSize: "21px",
  fontWeight: 500,
  letterSpacing: "-0.02em",
  lineHeight: "26px",
  margin: "0 0 24px",
}

const titleStyle: CSSProperties = {
  color: colors.text,
  fontFamily: displayFontFamily,
  fontSize: "30px",
  fontWeight: 500,
  letterSpacing: "-0.025em",
  lineHeight: "36px",
  margin: "0 0 20px",
}

const dividerStyle: CSSProperties = {
  borderColor: colors.border,
  margin: "32px 0 20px",
}

const footerStyle: CSSProperties = {
  color: colors.muted,
  fontFamily: monoFontFamily,
  fontSize: "11px",
  lineHeight: "18px",
  margin: 0,
}

const footerLinkStyle: CSSProperties = {
  color: colors.secondary,
  textDecoration: "underline",
}

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
        <meta content="light" name="color-scheme" />
        <meta content="light" name="supported-color-schemes" />
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
            This email was sent by {ASTREEX_BRAND}. Review your account in{" "}
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
