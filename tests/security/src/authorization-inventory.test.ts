import { existsSync, readdirSync, readFileSync, type Dirent } from "node:fs"
import { basename, dirname, extname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"
import { describe, expect, it } from "vitest"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const appsRoot = join(repoRoot, "apps")
const packagesRoot = join(repoRoot, "packages")
const adminAppRoot = join(appsRoot, "admin", "app")
const protectedAdminRoot = join(adminAppRoot, "(admin)")
const convexRoot = join(packagesRoot, "backend", "convex")
const savedViewsModule = join(convexRoot, "savedViews.ts")
const environmentExample = join(repoRoot, ".env.example")

const codeExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"])
const skippedDirectories = new Set([
  ".next",
  ".turbo",
  "_generated",
  "coverage",
  "dist",
  "node_modules",
])

const approvedPublicBuilders = new Set([
  "adminAction",
  "adminMutation",
  "adminQuery",
  "authenticatedAction",
  "authenticatedMutation",
  "authenticatedQuery",
  "customerAction",
  "customerMutation",
  "customerQuery",
])
const adminBuilders = new Set(["adminAction", "adminMutation", "adminQuery"])
const internalBuilders = new Set([
  "internalAction",
  "internalMutation",
  "internalQuery",
])
const rawPublicBuilders = new Set([
  "action",
  "httpAction",
  "mutation",
  "publicQuery",
  "query",
])
const knownBuilders = new Set([
  ...approvedPublicBuilders,
  ...internalBuilders,
  ...rawPublicBuilders,
])

const explicitPublicAllowlist = new Map([
  ["billing/creemHttp:creemWebhook", "httpAction"],
  ["changelog:getPublishedEntry", "publicQuery"],
  ["changelog:listPublishedEntries", "publicQuery"],
  ["email/resendHttp:resendWebhook", "httpAction"],
])

const providerSecretNames = [
  "CREEM_API_KEY",
  "CREEM_WEBHOOK_SECRET",
  "DEEPSEEK_API_KEY",
  "FETCHLAYER_API_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "TINYFISH_API_KEY",
  "XQUIK_API_KEY",
] as const

const forbiddenProductLanguage = /\b(?:mock(?:ed|ing|s)?|stripe|trial)\b/iu
const forbiddenRuntimeAdapterName =
  /(?:mock|fake|fixture|stub).*adapter|adapter.*(?:mock|fake|fixture|stub)/iu
const forbiddenRuntimeImport =
  /(?:^|\/)(?:__mocks__|fakes?|fixtures?|mocks?|stubs?)(?:\/|$)/iu
const forbiddenSavedViewImport =
  /(?:^|\/)(?:integrations\/providers|scheduler|scheduling)(?:\/|$)/iu

function slashPath(path: string): string {
  return path.split(sep).join("/")
}

function repoPath(path: string): string {
  return slashPath(relative(repoRoot, path))
}

function sortedDirectoryEntries(directory: string): Dirent[] {
  return readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name, "en"),
  )
}

function codeFiles(directory: string): string[] {
  const files: string[] = []

  for (const entry of sortedDirectoryEntries(directory)) {
    if (skippedDirectories.has(entry.name)) {
      continue
    }

    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...codeFiles(path))
    } else if (entry.isFile() && codeExtensions.has(extname(entry.name))) {
      files.push(path)
    }
  }

  return files
}

function isProductionCode(file: string): boolean {
  const path = repoPath(file)
  return (
    !/(?:^|\/)(?:__tests__|fixtures?|tests?)(?:\/|$)/u.test(path) &&
    !/\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(path)
  )
}

function scriptKind(file: string): ts.ScriptKind {
  switch (extname(file)) {
    case ".js":
    case ".cjs":
    case ".mjs":
      return ts.ScriptKind.JS
    case ".jsx":
      return ts.ScriptKind.JSX
    case ".tsx":
      return ts.ScriptKind.TSX
    default:
      return ts.ScriptKind.TS
  }
}

function parsedSource(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  )
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
  )
}

function isExported(node: ts.Node): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword)
}

function propertyName(node: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) {
    return node.text
  }

  return undefined
}

function lineLocation(source: ts.SourceFile, node: ts.Node): string {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source))
  return `${repoPath(source.fileName)}:${position.line + 1}`
}

function calledIdentifier(call: ts.CallExpression): string | undefined {
  return ts.isIdentifier(call.expression) ? call.expression.text : undefined
}

function containsHandlerObject(call: ts.CallExpression): boolean {
  const firstArgument = call.arguments[0]
  if (!firstArgument || !ts.isObjectLiteralExpression(firstArgument)) {
    return false
  }

  return firstArgument.properties.some(
    (property) =>
      (ts.isPropertyAssignment(property) || ts.isMethodDeclaration(property)) &&
      propertyName(property.name) === "handler",
  )
}

type FunctionKind = "action" | "httpAction" | "mutation" | "query"

type FunctionRegistration = {
  builder: string
  functionName: string
  kind: FunctionKind | undefined
  location: string
}

function builderKind(builder: string): FunctionKind | undefined {
  if (builder.endsWith("Action")) {
    return builder === "httpAction" ? "httpAction" : "action"
  }
  if (builder.endsWith("Mutation")) {
    return "mutation"
  }
  if (builder.endsWith("Query")) {
    return "query"
  }

  if (builder === "action") return "action"
  if (builder === "mutation") return "mutation"
  if (builder === "query") return "query"
  return undefined
}

function convexModuleName(file: string): string {
  return slashPath(relative(convexRoot, file)).replace(/\.tsx?$/u, "")
}

function registrations(file: string): FunctionRegistration[] {
  const source = parsedSource(file)
  const found: FunctionRegistration[] = []

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) {
      continue
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        !declaration.initializer ||
        !ts.isCallExpression(declaration.initializer)
      ) {
        continue
      }

      const call = declaration.initializer
      const builder = calledIdentifier(call)
      if (
        (builder === undefined || !knownBuilders.has(builder)) &&
        !containsHandlerObject(call)
      ) {
        continue
      }

      found.push({
        builder: builder ?? "<unrecognized>",
        functionName: `${convexModuleName(file)}:${declaration.name.text}`,
        kind: builder === undefined ? undefined : builderKind(builder),
        location: lineLocation(source, declaration.name),
      })
    }
  }

  return found
}

function hasDirective(source: ts.SourceFile, directive: string): boolean {
  return source.statements.some(
    (statement) =>
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression) &&
      statement.expression.text === directive,
  )
}

function importedAdminGuards(source: ts.SourceFile): Set<string> {
  const guards = new Set<string>()

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@/lib/admin-auth" ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      continue
    }

    for (const element of statement.importClause.namedBindings.elements) {
      const imported = element.propertyName?.text ?? element.name.text
      if (imported === "guardAdmin" || imported === "requireAdminAccess") {
        guards.add(element.name.text)
      }
    }
  }

  return guards
}

type ExportedFunction = {
  defaultExport: boolean
  name: string
  node: ts.FunctionLikeDeclaration
}

function exportedFunctions(source: ts.SourceFile): ExportedFunction[] {
  const functions: ExportedFunction[] = []

  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      isExported(statement) &&
      statement.body
    ) {
      functions.push({
        defaultExport: hasModifier(statement, ts.SyntaxKind.DefaultKeyword),
        name: statement.name?.text ?? "<default>",
        node: statement,
      })
      continue
    }

    if (!ts.isVariableStatement(statement) || !isExported(statement)) {
      continue
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        (ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer))
      ) {
        functions.push({
          defaultExport: false,
          name: declaration.name.text,
          node: declaration.initializer,
        })
      }
    }
  }

  return functions
}

function functionCallsGuard(
  functionNode: ts.FunctionLikeDeclaration,
  guardNames: ReadonlySet<string>,
): boolean {
  let guarded = false
  const body = functionNode.body
  if (!body) {
    return false
  }

  const visit = (node: ts.Node): void => {
    if (guarded) return
    if (node !== body && ts.isFunctionLike(node)) return

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      guardNames.has(node.expression.text)
    ) {
      guarded = true
      return
    }

    ts.forEachChild(node, visit)
  }

  visit(body)
  return guarded
}

function guardViolations(
  file: string,
  functions: readonly ExportedFunction[],
): string[] {
  const source = parsedSource(file)
  const guardNames = importedAdminGuards(source)

  return functions
    .filter((candidate) => !functionCallsGuard(candidate.node, guardNames))
    .map(
      (candidate) =>
        `${lineLocation(source, candidate.node)} ${candidate.name} does not call an imported server admin guard`,
    )
}

function importSpecifiers(
  file: string,
): { location: string; specifier: string }[] {
  const source = parsedSource(file)
  const imports: { location: string; specifier: string }[] = []

  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      imports.push({
        location: lineLocation(source, statement.moduleSpecifier),
        specifier: statement.moduleSpecifier.text,
      })
    }
  }

  return imports
}

type TextSegment = {
  location: string
  text: string
}

function sourceTextSegments(file: string): TextSegment[] {
  const source = parsedSource(file)
  const segments: TextSegment[] = []

  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isJsxText(node)
    ) {
      segments.push({ location: lineLocation(source, node), text: node.text })
    } else if (ts.isTemplateExpression(node)) {
      segments.push({
        location: lineLocation(source, node),
        text: [
          node.head.text,
          ...node.templateSpans.map((span) => span.literal.text),
        ].join(" "),
      })
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return segments
}

function runtimeAdapterViolations(file: string): string[] {
  const source = parsedSource(file)
  const violations: string[] = []
  const path = repoPath(file)

  if (forbiddenRuntimeImport.test(`/${path}`)) {
    violations.push(`${path} is stored in a test-double runtime path`)
  }

  for (const imported of importSpecifiers(file)) {
    if (forbiddenRuntimeImport.test(imported.specifier)) {
      violations.push(
        `${imported.location} imports runtime code from ${imported.specifier}`,
      )
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && forbiddenRuntimeAdapterName.test(node.text)) {
      violations.push(
        `${lineLocation(source, node)} declares permanent test-double adapter ${node.text}`,
      )
    }
    ts.forEachChild(node, visit)
  }

  visit(source)

  for (const match of readFileSync(file, "utf8").matchAll(
    /\b(?:ENABLE_|USE_)?(?:FAKE|MOCK|STUB)_[A-Z0-9_]+\b/gu,
  )) {
    violations.push(`${path} contains runtime test-double switch ${match[0]}`)
  }

  return [...new Set(violations)]
}

function objectPropertyExpression(
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | undefined {
  const property = object.properties.find(
    (candidate) =>
      ts.isPropertyAssignment(candidate) &&
      propertyName(candidate.name) === name,
  )

  return property && ts.isPropertyAssignment(property)
    ? property.initializer
    : undefined
}

function stringConstants(source: ts.SourceFile): Map<string, string> {
  const constants = new Map<string, string>()

  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer &&
        (ts.isStringLiteral(declaration.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(declaration.initializer))
      ) {
        constants.set(declaration.name.text, declaration.initializer.text)
      }
    }
  }

  return constants
}

function expressionText(
  expression: ts.Expression | undefined,
  constants: ReadonlyMap<string, string>,
): string | undefined {
  if (!expression) return undefined
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text
  }
  if (ts.isIdentifier(expression)) {
    return constants.get(expression.text) ?? expression.text
  }
  return undefined
}

type HttpRoute = {
  handler: string | undefined
  method: string | undefined
  path: string | undefined
}

function httpRoutes(file: string): HttpRoute[] {
  const source = parsedSource(file)
  const constants = stringConstants(source)
  const routes: HttpRoute[] = []

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "route" &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const config = node.arguments[0]
      routes.push({
        handler: expressionText(
          objectPropertyExpression(config, "handler"),
          constants,
        ),
        method: expressionText(
          objectPropertyExpression(config, "method"),
          constants,
        ),
        path: expressionText(
          objectPropertyExpression(config, "path"),
          constants,
        ),
      })
    }

    ts.forEachChild(node, visit)
  }

  visit(source)
  return routes
}

function containsIdentifier(node: ts.Node, identifier: string): boolean {
  let found = false
  const visit = (candidate: ts.Node): void => {
    if (found) return
    if (ts.isIdentifier(candidate) && candidate.text === identifier) {
      found = true
      return
    }
    ts.forEachChild(candidate, visit)
  }
  visit(node)
  return found
}

type RawBodyInspection = {
  jsonReads: string[]
  rawReads: { identifier: string; position: number }[]
  verifierCalls: { position: number; usesRawBody: boolean }[]
}

function inspectRawBodyHandler(
  file: string,
  verifierName: string,
): RawBodyInspection {
  const source = parsedSource(file)
  const rawReads: { identifier: string; position: number }[] = []
  const jsonReads: string[] = []
  const verifierCalls: ts.CallExpression[] = []

  const requestMethod = (
    expression: ts.Expression,
    method: "json" | "text",
  ): boolean =>
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "request" &&
    expression.name.text === method

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isAwaitExpression(node.initializer) &&
      ts.isCallExpression(node.initializer.expression) &&
      requestMethod(node.initializer.expression.expression, "text")
    ) {
      rawReads.push({
        identifier: node.name.text,
        position: node.getStart(source),
      })
    }

    if (ts.isCallExpression(node) && requestMethod(node.expression, "json")) {
      jsonReads.push(lineLocation(source, node))
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === verifierName
    ) {
      verifierCalls.push(node)
    }

    ts.forEachChild(node, visit)
  }

  visit(source)

  return {
    jsonReads,
    rawReads,
    verifierCalls: verifierCalls.map((call) => ({
      position: call.getStart(source),
      usesRawBody: rawReads.some((rawRead) =>
        call.arguments.some((argument) =>
          containsIdentifier(argument, rawRead.identifier),
        ),
      ),
    })),
  }
}

const convexFiles = codeFiles(convexRoot).filter(
  (file) => extname(file) === ".ts",
)
const backendRegistrations = convexFiles.flatMap(registrations)
const frontendProductionFiles = [
  ...codeFiles(join(appsRoot, "web")),
  ...codeFiles(join(appsRoot, "admin")),
].filter(isProductionCode)
const productionFiles = [
  ...codeFiles(appsRoot),
  ...codeFiles(packagesRoot),
].filter(isProductionCode)

describe("frontend and environment security inventory", () => {
  it("keeps provider secret configuration out of frontend source", () => {
    const violations = frontendProductionFiles.flatMap((file) => {
      const text = readFileSync(file, "utf8")
      return providerSecretNames
        .filter((secretName) => text.includes(secretName))
        .map((secretName) => `${repoPath(file)} references ${secretName}`)
    })

    expect(violations).toEqual([])
  })

  it("never exposes sensitive or provider configuration through NEXT_PUBLIC", () => {
    const files = existsSync(environmentExample)
      ? [...productionFiles, environmentExample]
      : productionFiles
    const violations: string[] = []

    for (const file of files) {
      const names = new Set(
        readFileSync(file, "utf8").match(/NEXT_PUBLIC_[A-Z0-9_]+/gu) ?? [],
      )
      for (const name of names) {
        if (
          /^NEXT_PUBLIC_(?:CREEM|DEEPSEEK|FETCHLAYER|RESEND|TINYFISH|XQUIK)_/u.test(
            name,
          ) ||
          /(?:API_KEY|ACCESS_TOKEN|PASSWORD|PRIVATE_KEY|SECRET|WEBHOOK_SECRET)(?:_|$)/u.test(
            name,
          )
        ) {
          violations.push(`${repoPath(file)} exposes ${name}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})

describe("Convex public authorization inventory", () => {
  it("uses approved wrappers or the explicit public changelog/webhook allowlist", () => {
    const violations: string[] = []
    const observedAllowlist = new Set<string>()

    expect(backendRegistrations.length).toBeGreaterThan(0)

    for (const registration of backendRegistrations) {
      if (approvedPublicBuilders.has(registration.builder)) {
        continue
      }
      if (internalBuilders.has(registration.builder)) {
        continue
      }

      const allowedBuilder = explicitPublicAllowlist.get(
        registration.functionName,
      )
      if (allowedBuilder === registration.builder) {
        observedAllowlist.add(registration.functionName)
        continue
      }

      violations.push(
        `${registration.location} ${registration.functionName} uses unapproved public builder ${registration.builder}`,
      )
    }

    for (const [functionName, builder] of explicitPublicAllowlist) {
      if (!observedAllowlist.has(functionName)) {
        violations.push(
          `${functionName} must exist as the explicit ${builder} public exception`,
        )
      }
    }

    expect(violations).toEqual([])
  })

  it("requires every admin Convex function to use an admin wrapper", () => {
    const violations = backendRegistrations
      .filter(({ functionName }) => functionName.startsWith("admin:"))
      .filter(({ builder }) => !adminBuilders.has(builder))
      .map(
        ({ builder, functionName, location }) =>
          `${location} ${functionName} uses ${builder}`,
      )

    expect(violations).toEqual([])
  })
})

describe("admin server guard inventory", () => {
  it("guards the protected admin route segment on the server", () => {
    const layoutFile = join(protectedAdminRoot, "layout.tsx")
    const source = parsedSource(layoutFile)
    const layout = exportedFunctions(source).find(
      (candidate) => candidate.defaultExport,
    )

    expect(layout).toBeDefined()
    expect(
      layout
        ? functionCallsGuard(layout.node, importedAdminGuards(source))
        : false,
    ).toBe(true)
  })

  it("guards admin pages outside the protected route segment", () => {
    const pageFiles = codeFiles(adminAppRoot).filter(
      (file) =>
        basename(file) === "page.tsx" &&
        !file.startsWith(`${protectedAdminRoot}${sep}`),
    )
    const violations = pageFiles.flatMap((file) => {
      const source = parsedSource(file)
      const page = exportedFunctions(source).filter(
        (candidate) => candidate.defaultExport,
      )
      return page.length === 0
        ? [`${repoPath(file)} does not export a page function`]
        : guardViolations(file, page)
    })

    expect(violations).toEqual([])
  })

  it("guards every admin route handler", () => {
    const httpMethods = new Set([
      "DELETE",
      "GET",
      "HEAD",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT",
    ])
    const routeFiles = codeFiles(adminAppRoot).filter(
      (file) => basename(file) === "route.ts",
    )
    const violations = routeFiles.flatMap((file) => {
      const source = parsedSource(file)
      const handlers = exportedFunctions(source).filter((candidate) =>
        httpMethods.has(candidate.name),
      )
      return handlers.length === 0
        ? [`${repoPath(file)} does not export an HTTP handler`]
        : guardViolations(file, handlers)
    })

    expect(routeFiles.length).toBeGreaterThan(0)
    expect(violations).toEqual([])
  })

  it("guards every exported server action", () => {
    const actionFiles = codeFiles(adminAppRoot).filter((file) =>
      hasDirective(parsedSource(file), "use server"),
    )
    const violations = actionFiles.flatMap((file) => {
      const source = parsedSource(file)
      const actions = exportedFunctions(source)
      return actions.length === 0
        ? [`${repoPath(file)} has use server but exports no action function`]
        : guardViolations(file, actions)
    })

    expect(actionFiles.length).toBeGreaterThan(0)
    expect(violations).toEqual([])
  })
})

describe("provider webhook boundaries", () => {
  const webhookSpecs = [
    {
      file: join(convexRoot, "billing", "creemHttp.ts"),
      handler: "creemWebhook",
      path: "/webhooks/creem",
      verifier: "verifyCreemWebhookSignature",
    },
    {
      file: join(convexRoot, "email", "resendHttp.ts"),
      handler: "resendWebhook",
      path: "/webhooks/resend",
      verifier: "verifyResendEmailWebhook",
    },
  ] as const

  it("mounts Creem and Resend POST handlers in the root HTTP router", () => {
    const routes = httpRoutes(join(convexRoot, "http.ts"))

    for (const spec of webhookSpecs) {
      expect(routes).toContainEqual({
        handler: spec.handler,
        method: "POST",
        path: spec.path,
      })
    }
  })

  it.each(webhookSpecs)(
    "$handler reads and verifies the untouched raw body",
    ({ file, handler, verifier }) => {
      expect(existsSync(file)).toBe(true)
      const registration = registrations(file).find((candidate) =>
        candidate.functionName.endsWith(`:${handler}`),
      )
      const inspection = inspectRawBodyHandler(file, verifier)

      expect(registration?.builder).toBe("httpAction")
      expect(inspection.jsonReads).toEqual([])
      expect(inspection.rawReads).toHaveLength(1)
      expect(inspection.verifierCalls).toHaveLength(1)
      expect(inspection.verifierCalls[0]?.usesRawBody).toBe(true)
      expect(inspection.rawReads[0]?.position).toBeLessThan(
        inspection.verifierCalls[0]?.position ?? -1,
      )
    },
  )
})

describe("production integrity inventory", () => {
  it("contains no Stripe, trial, or mock product language", () => {
    const violations = productionFiles.flatMap((file) =>
      sourceTextSegments(file)
        .filter((segment) => forbiddenProductLanguage.test(segment.text))
        .map(
          (segment) =>
            `${segment.location} contains forbidden product language: ${JSON.stringify(segment.text.trim())}`,
        ),
    )

    expect(violations).toEqual([])
  })

  it("contains no permanent runtime test-double adapters", () => {
    const backendRuntimeFiles = codeFiles(convexRoot).filter(isProductionCode)
    expect(backendRuntimeFiles.flatMap(runtimeAdapterViolations)).toEqual([])
  })

  it("keeps saved views independent from providers and schedulers", () => {
    const violations = importSpecifiers(savedViewsModule)
      .filter(({ specifier }) => forbiddenSavedViewImport.test(specifier))
      .map(
        ({ location, specifier }) =>
          `${location} imports forbidden saved-view dependency ${specifier}`,
      )

    expect(violations).toEqual([])
  })
})
