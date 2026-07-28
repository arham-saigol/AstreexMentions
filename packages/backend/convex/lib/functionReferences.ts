import {
  makeFunctionReference,
  type DefaultFunctionArgs,
  type FunctionReference,
} from "convex/server"

function internalFunctionReference<
  Type extends "action" | "mutation" | "query",
  Args extends DefaultFunctionArgs,
  ReturnType,
>(
  type: Type,
  name: string,
): FunctionReference<Type, "internal", Args, ReturnType> {
  return makeFunctionReference<Type, Args, ReturnType>(
    name,
  ) as unknown as FunctionReference<Type, "internal", Args, ReturnType>
}

/** Typed internal references used while Convex codegen is credential-blocked. */
export function internalActionReference<
  Args extends DefaultFunctionArgs,
  ReturnType = unknown,
>(name: string): FunctionReference<"action", "internal", Args, ReturnType> {
  return internalFunctionReference("action", name)
}

export function internalMutationReference<
  Args extends DefaultFunctionArgs,
  ReturnType = unknown,
>(name: string): FunctionReference<"mutation", "internal", Args, ReturnType> {
  return internalFunctionReference("mutation", name)
}

export function internalQueryReference<
  Args extends DefaultFunctionArgs,
  ReturnType = unknown,
>(name: string): FunctionReference<"query", "internal", Args, ReturnType> {
  return internalFunctionReference("query", name)
}
