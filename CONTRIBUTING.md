# Contributing

Read [AGENTS.md](AGENTS.md) first. It defines the repository rules.
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes the stack, the domain rules, the schema, and the API.
Read [SECURITY.md](SECURITY.md) before you change the server, the CORS list, or the file routes.
This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

Open an issue before a large change, so nobody writes the same code twice.
A small bug fix needs no issue.
trellis needs [Bun](https://bun.sh) 1.3.

## Development loop

`bun run dev` starts the server on 4521 and the web app on 5173.

```sh
bun install
TRELLIS_HOME=$(mktemp -d) bun run dev
```

Open `http://127.0.0.1:5173`. Vite sends `/api` and `/rpc` to the server on 4521.
A temporary `TRELLIS_HOME` keeps the loop away from your own data, and each run starts from an empty database.
Drop the variable to work against `~/.trellis`.

Assess the risk of the change and choose checks that cover the affected code.
Balance speed with the cost of an error.
Run the linter and type checks before a handoff.

| Command | What it runs |
|---|---|
| `bun run typecheck` | `tsc --noEmit` in every workspace. |
| `bun run typecheck:repo` | `tsc --noEmit` for repository scripts. |
| `bun run lint` | Biome over the whole tree. `bun run lint:fix` applies the fixes. |
| `bun run check` | The linter and both type checks through Turbo. |

## Repository map

| Path | Package | Purpose |
|---|---|---|
| `packages/api` | `@trellis/api` | Schemas, refs, errors, contracts, clients, events, and query keys. |
| `packages/ui` | `@trellis/ui` | Design tokens, Base UI wrappers, and visual primitives. |
| `packages/cli` | `@trellis/cli` | The `trellis` command and HTTP client. |
| `apps/server` | `@trellis/server` | The Hono server, procedures, services, database worker, and GitHub poller. |
| `apps/web` | `@trellis/web` | The React web app. |
| `apps/mobile` | `@trellis/mobile` | The Expo mobile app. |
| `docs` | | The architecture reference, the agent setup guide, and the images. |

The dependency graph is a star with `@trellis/api` at the center.
Only `@trellis/web` imports `@trellis/ui`.
Each package exports TypeScript source without side effects.

## Add a procedure

1. Add the resource schemas under `packages/api/src/schemas/`.
2. Add the oRPC contract under `packages/api/src/contract/`, then list the router in `packages/api/src/contract/index.ts`.
3. Add the service under `apps/server/src/services/` with the `(ctx, tx, input) => result` signature.
4. Add the procedure under `apps/server/src/procedures/`.
5. Add the CLI verb under `packages/cli/src/commands/`, then add its row to `packages/cli/src/verbs.ts`.

The procedure resolves refs, calls the service, and returns the result.
The service receives `tx` and never imports a module-level database client.

## Database migration

1. Change `apps/server/src/db/schema.ts`.
2. Run `bun run db:generate`.
3. Commit the generated SQL and the `meta/` directory with the schema change.

Do not edit a generated migration.
The check fails when schema generation changes `apps/server/drizzle/`.

## Review pass

1. Read the full diff and remove changes that are not part of the work.
2. Run the linter and type checks for the affected code.
3. Report the checks, their results, and any relevant gaps.
4. Try to refute your own correctness claim and your own code quality.
5. Give each finding a file, a line, a claim, and evidence.
6. Do the review again until a pass has no findings.

## Pull request

Write one commit per result that a user sees.
State what broke, what changed, and one sentence about how you verified it.
Use no headers, no tables, and no checklists.
Add a changeset with `bunx changeset` when the change touches a published behavior.
CI runs `bun run check` on macOS and Ubuntu, and it checks the migration diff.
