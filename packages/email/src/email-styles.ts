import type { CSSProperties } from "react"

import { colors, fontFamily } from "./email-layout"

export const emailParagraphStyle: CSSProperties = {
  color: colors.text,
  fontFamily,
  fontSize: "16px",
  lineHeight: "26px",
  margin: "0 0 16px",
}

export const emailDetailsTextStyle: CSSProperties = {
  color: colors.text,
  fontFamily,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 4px",
}

export const emailButtonContainerStyle: CSSProperties = {
  margin: "28px 0 8px",
}

export const emailPrimaryButtonStyle: CSSProperties = {
  backgroundColor: colors.accent,
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontFamily,
  fontSize: "15px",
  fontWeight: 500,
  lineHeight: "20px",
  padding: "12px 18px",
  textDecoration: "none",
}
