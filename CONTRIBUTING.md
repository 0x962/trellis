# Contributing

Read [AGENTS.md](AGENTS.md) first. It defines the repository rules.
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes the stack, the domain rules, the schema, and the API.
Read [SECURITY.md](SECURITY.md) before you change the server, the CORS list, or the file routes.
This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

Open an issue before a large change, so nobody writes the same code twice.
A bug fix with a failing test needs no issue.
trellis needs [Bun](https://bun.sh) 1.3. Some suites need macOS, and CI runs them.

## Development loop

`bun run dev` starts the server on 4521 and the web app on 5173.

```sh
bun install
TRELLIS_HOME=$(mktemp -d) bun run dev
```

Open `http://127.0.0.1:5173`.
A temporary `TRELLIS_HOME` keeps the loop away from your own data, and each run starts from an empty database.
Drop the variable to work against `~/.trellis`.
For the end-to-end suite, Playwright starts both processes.

Assess the risk of the change and choose checks that cover the affected behavior.
Balance speed with the cost of an error.
Use focused tests for narrow changes and broader checks when the risk warrants them.
The full `bun run check` command and performance tests are optional.
One agent handles tests, implementation, and review, and decides whether browser checks add useful evidence.

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
| `test` | | Tests for repository configuration and public files. |

The dependency graph is a star with `@trellis/api` at the center.
Only `@trellis/web` imports `@trellis/ui`.
Each package exports TypeScript source without side effects.

## Add a procedure

1. Add the resource schemas under `packages/api/src/schemas/`.
2. Add the oRPC contract under `packages/api/src/contract/`.
3. Write a failing unit test beside the service.
4. Write a failing contract test beside the server procedure.
5. Add the service under `apps/server/src/services/` with the `(ctx, tx, input) => result` signature.
6. Add the procedure under `apps/server/src/procedures/`.
7. Add the CLI verb under `packages/cli/src/commands/`.
8. Add a CLI smoke test under `packages/cli/test/`.

The procedure resolves refs, calls the service, and returns the result.
The service receives `tx` and never imports a module-level database client.
End every service test with `assertStatusInvariant(tx)`.

Each workspace has a `bunfig.toml` file with `[test]` and `preload = ["../../test/preload.ts"]`.
The preload gives each test run a temporary `TRELLIS_HOME`.

## TDD rule

Start every change with a failing test for the specified outcome.
Make sure that the test fails for the correct reason.
Make the test pass. Do not delete the test or weaken its assertions.
If you think a test is wrong, say so in the pull request and give the reason.

## Database migration

1. Change `apps/server/src/db/schema.ts`.
2. Run `bun run db:generate`.
3. Commit the generated SQL and the `meta/` directory with the schema change.

Do not edit a generated migration.
The check fails when schema generation changes `apps/server/drizzle/`.

## Review pass

1. Read the full diff and remove changes that are not part of the work.
2. Choose tests and checks based on the affected code and the risk of the change.
3. Report the checks, their results, and any relevant gaps.
4. Try to refute your own tests, your own correctness claim, and your own code quality.
5. Give each finding a file, a line, a claim, and evidence.
6. For each missing case, add a failing test before the fix.
7. Do the review again until a pass has no findings.

## Pull request

Write one commit per result that a user sees.
State what broke, what changed, and one sentence about how you verified it.
Use no headers, no tables, and no checklists.
Add a changeset with `bunx changeset` when the change touches a published behavior.
CI runs `bun run check` on macOS and Ubuntu, the Playwright suite on macOS, and the migration diff.
