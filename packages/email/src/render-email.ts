import { render } from "react-email"
import type { ReactNode } from "react"

export type RenderedEmail = {
  html: string
  subject: string
  text: string
}

export async function renderEmail(
  subject: string,
  template: ReactNode,
): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([
    render(template),
    render(template, { plainText: true }),
  ])

  return { html, subject, text }
}
