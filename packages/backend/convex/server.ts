import {
  actionGeneric,
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server"
import type {
  GenericActionCtx,
  GenericDataModel,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericMutationCtx,
  GenericQueryCtx,
  IndexRange,
} from "convex/server"

/**
 * Pre-codegen Convex constructors. These are the official generic exports, not
 * hand-authored generated types. After a deployment is configured, run Convex
 * codegen and migrate imports to _generated/server for schema-specific typing.
 */
export const query = queryGeneric
export const internalQuery = internalQueryGeneric
export const mutation = mutationGeneric
export const internalMutation = internalMutationGeneric
export const action = actionGeneric
export const internalAction = internalActionGeneric
export const httpAction = httpActionGeneric

export const env = process.env as Readonly<
  Record<string, string | undefined> & {
    ADMIN_CLERK_USER_ID?: string
  }
>

type RuntimeIndexRangeBuilder = IndexRange & {
  eq(fieldName: string, value: unknown): RuntimeIndexRangeBuilder
  gte(fieldName: string, value: unknown): RuntimeIndexRangeBuilder
  lt(fieldName: string, value: unknown): RuntimeIndexRangeBuilder
}

/**
 * Generic data models cannot express application index tuples before codegen.
 * This helper retains the real withIndex runtime behavior while keeping every
 * equality field explicit at each call site.
 */
export function indexEquals(
  builder: IndexRange,
  ...fields: readonly (readonly [fieldName: string, value: unknown])[]
): IndexRange {
  let range = builder as RuntimeIndexRangeBuilder
  for (const [fieldName, value] of fields) {
    range = range.eq(fieldName, value)
  }
  return range
}

export function indexGreaterThanOrEqual(
  builder: IndexRange,
  fieldName: string,
  value: unknown,
): IndexRange {
  return (builder as RuntimeIndexRangeBuilder).gte(fieldName, value)
}

export function indexLessThan(
  builder: IndexRange,
  fieldName: string,
  value: unknown,
): IndexRange {
  return (builder as RuntimeIndexRangeBuilder).lt(fieldName, value)
}

export type QueryCtx = GenericQueryCtx<GenericDataModel>
export type MutationCtx = GenericMutationCtx<GenericDataModel>
export type ActionCtx = GenericActionCtx<GenericDataModel>
export type DatabaseReader = GenericDatabaseReader<GenericDataModel>
export type DatabaseWriter = GenericDatabaseWriter<GenericDataModel>
