# Astreex backend

This package contains the Convex schema, functions, authorization boundary, and
durable workflows.

## Convex code generation

Run code generation after changing the schema or function signatures:

```sh
pnpm --filter @astreex/backend codegen
```

The generated server builders, data model, and function references are checked
in under `convex/_generated`. Commit their updates with the source change so
backend and frontend packages compile against the same contract.
