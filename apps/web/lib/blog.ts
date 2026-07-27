import "server-only"

import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

import matter from "gray-matter"
import { cache } from "react"
import { z } from "zod"

const BLOG_DIRECTORY = path.join(process.cwd(), "content", "blog")
const MARKDOWN_FILE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const blogCategories = ["Monitoring", "Strategy", "Operations"] as const

export type BlogCategory = (typeof blogCategories)[number]

const blogFrontmatterSchema = z
  .object({
    title: z.string().trim().min(10).max(90),
    description: z.string().trim().min(40).max(180),
    publishedAt: z.string().regex(DATE_PATTERN),
    updatedAt: z.string().regex(DATE_PATTERN).optional(),
    category: z.enum(blogCategories),
    author: z.string().trim().min(2).max(80).default("Astreex editorial"),
    featured: z.boolean().default(false),
    keywords: z.array(z.string().trim().min(2).max(60)).min(3).max(8),
  })
  .strict()

export type BlogFrontmatter = z.infer<typeof blogFrontmatterSchema>

export type BlogPost = BlogFrontmatter & {
  slug: string
  content: string
  readingTimeMinutes: number
  wordCount: number
}

export type BlogPostSummary = Omit<BlogPost, "content">

function getMarkdownFileNames(): string[] {
  return readdirSync(BLOG_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MARKDOWN_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
}

function countWords(content: string): number {
  const plainText = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_|~-]/g, " ")

  return plainText.split(/\s+/).filter(Boolean).length
}

function parseBlogPost(fileName: string): BlogPost {
  const slug = fileName.replace(/\.md$/, "")
  const source = readFileSync(path.join(BLOG_DIRECTORY, fileName), "utf8")
  const { data, content } = matter(source)
  const parsedFrontmatter = blogFrontmatterSchema.safeParse(data)

  if (!parsedFrontmatter.success) {
    const issues = parsedFrontmatter.error.issues
      .map(
        (issue) => `${issue.path.join(".") || "frontmatter"}: ${issue.message}`,
      )
      .join("; ")

    throw new Error(`Invalid blog frontmatter in ${fileName}: ${issues}`)
  }

  const wordCount = countWords(content)

  return {
    ...parsedFrontmatter.data,
    slug,
    content: content.trim(),
    wordCount,
    readingTimeMinutes: Math.max(1, Math.ceil(wordCount / 220)),
  }
}

export const getAllBlogPosts = cache((): BlogPostSummary[] => {
  return getMarkdownFileNames()
    .map((fileName) => {
      const { content: _content, ...summary } = parseBlogPost(fileName)
      return summary
    })
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
})

export const getBlogPostSlugs = cache((): string[] => {
  return getMarkdownFileNames().map((fileName) => fileName.replace(/\.md$/, ""))
})

export const getBlogPostBySlug = cache((slug: string): BlogPost | null => {
  if (!SLUG_PATTERN.test(slug)) {
    return null
  }

  const fileName = `${slug}.md`
  if (!getMarkdownFileNames().includes(fileName)) {
    return null
  }

  return parseBlogPost(fileName)
})

export function formatBlogDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`))
}
