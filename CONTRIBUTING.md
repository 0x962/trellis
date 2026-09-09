# Contributing

Read [AGENTS.md](AGENTS.md) first. It holds the repo rules. This file holds the workflow.

## Dev loop

1. Run `bun install` once per clone.
2. Run `bun run dev` to start the server on port 4521 and the web app on port 5173.
3. Run `bun run check` before every hand-off. It runs lint, typecheck, and every test.
4. Run `bun run lint:fix` to apply the Biome fixes.

`bun run test` runs the tests of every workspace through turbo. `bun run test:repo` runs the root tests in `test/`. `test/preload.ts` gives a test run a fresh `TRELLIS_HOME`. Bun reads `bunfig.toml` from the current directory only, so every workspace ships a `bunfig.toml` with `[test]` and `preload = ["../../test/preload.ts"]`.

## Where things live

| Path | Package | Holds |
|---|---|---|
| `packages/api` | `@trellis/api` | Zod schemas, refs, errors, the oRPC contract, the client factory, event types, query keys |
| `packages/ui` | `@trellis/ui` | design tokens, Base UI wrappers, every visual primitive |
| `packages/cli` | `@trellis/cli` | the `trellis` command, HTTP only |
| `apps/server` | `@trellis/server` | Hono, oRPC handlers, the DB worker (PGlite, Drizzle, services), the gh poller |
| `apps/web` | `@trellis/web` | the React SPA |
| `apps/mobile` | `@trellis/mobile` | the Expo app |
| `docs/design` | | the plan and the design documents; `plan.md` wins over every other file there |
| `test` | | root tests that assert the repo configuration |

The dependency graph is a star. `api` is imported by server, web, mobile, and cli. `ui` is imported by web only. Packages export TypeScript source and are side-effect free. Layers import downward only. A `biome.json` override per workspace directory refuses an upward `@trellis/*` import, so a violation fails `lint`.

## How to add a procedure

1. Add the Zod schemas to `packages/api/src/schemas/<resource>.ts`.
2. Add the route to `packages/api/src/contract/<resource>.ts`, with its errors from `errors.ts`.
3. Write the failing tests: a unit test beside the service and a contract test in `apps/server/src/procedures/<resource>.test.ts`.
4. Write the service in `apps/server/src/services/<resource>.ts`. The signature is `(tx, ctx, input) => result`; `tx` is first.
5. Implement the procedure in `apps/server/src/procedures/<resource>.ts`. It resolves refs, calls the service, and returns. It holds no logic.
6. Add the CLI verb in `packages/cli/src/commands/<verb>.ts` and its smoke test in `packages/cli/test/`.

## Migration workflow

1. Change `apps/server/src/db/schema.ts`.
2. Run `bun run db:generate`. It runs `drizzle-kit generate` and writes the SQL into `apps/server/drizzle/`.
3. Commit the generated SQL and the `meta/` directory with the schema change.

Never edit a generated migration by hand. CI runs `drizzle-kit generate` and fails on a non-empty `git status --porcelain apps/server/drizzle/`.

## The TDD rule

Every change starts with a failing test. The builder makes the test pass and does not weaken it. A change without a test does not merge.
