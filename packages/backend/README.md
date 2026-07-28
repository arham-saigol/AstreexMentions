# Astreex backend

This package contains the Convex schema, authorization boundary, bootstrap flow,
and tested pure workflow modules.

## Convex code generation

The repository does not currently have Convex deployment credentials, so
`convex/_generated` is intentionally absent. Server functions import the local
`convex/server.ts` helper, which re-exports Convex's official generic
constructors (`queryGeneric`, `mutationGeneric`, `actionGeneric`, their internal
variants, and `httpActionGeneric`). No fake generated data model or API files
are checked in.

After a Convex deployment is configured, run:

```sh
pnpm --filter @astreex/backend codegen
```

Convex codegen is still required before consumers use the package's generated
`./api` and `./data-model` exports. Function imports can then be migrated from
`convex/server.ts` to `convex/_generated/server` to regain schema-specific
compile-time types.
