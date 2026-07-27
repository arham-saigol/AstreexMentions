import {
  makeFunctionReference,
  type FunctionReference,
  type FunctionType,
} from "convex/server"

type ConvexArguments = Record<string, unknown>

export function convexFunctionReference<
  Type extends FunctionType,
  Arguments extends ConvexArguments = Record<string, never>,
  Result = unknown,
>(name: string): FunctionReference<Type, "public", Arguments, Result> {
  return makeFunctionReference<Type, Arguments, Result>(name)
}

export function convexQueryReference<
  Arguments extends ConvexArguments = Record<string, never>,
  Result = unknown,
>(name: string): FunctionReference<"query", "public", Arguments, Result> {
  return convexFunctionReference<"query", Arguments, Result>(name)
}

export function convexMutationReference<
  Arguments extends ConvexArguments = Record<string, never>,
  Result = unknown,
>(name: string): FunctionReference<"mutation", "public", Arguments, Result> {
  return convexFunctionReference<"mutation", Arguments, Result>(name)
}

export function convexActionReference<
  Arguments extends ConvexArguments = Record<string, never>,
  Result = unknown,
>(name: string): FunctionReference<"action", "public", Arguments, Result> {
  return convexFunctionReference<"action", Arguments, Result>(name)
}
