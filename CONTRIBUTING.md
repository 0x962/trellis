# Contributing

Read [AGENTS.md](AGENTS.md) first. It defines the repository rules.
The [approved plan](docs/design/plan.md) defines the product.

## Development loop

`bun run dev` starts the server on 4521 and the web app on 5173.

```sh
bun install
TRELLIS_HOME=$(mktemp -d) bun run dev
```

Open `http://127.0.0.1:5173`.
A temporary `TRELLIS_HOME` keeps the loop away from your own data, and each
run starts from an empty database. Drop the variable to work against
`~/.trellis`.
Playwright starts both processes for the end-to-end suite.

Run a focused test while you change code.
Run `bun run lint:fix` before the full check.
Run `bun run check --force` before each hand-off.

## Repository map

| Path | Package | Purpose |
|---|---|---|
| `packages/api` | `@trellis/api` | Schemas, refs, errors, contracts, clients, events, and query keys. |
| `packages/ui` | `@trellis/ui` | Design tokens, Base UI wrappers, and visual primitives. |
| `packages/cli` | `@trellis/cli` | The `trellis` command and HTTP client. |
| `apps/server` | `@trellis/server` | The Hono server, procedures, services, database worker, and GitHub poller. |
| `apps/web` | `@trellis/web` | The React web app. |
| `apps/mobile` | `@trellis/mobile` | The Expo mobile app. |
| `docs/design` | | The approved plan and supporting design documents. |
| `test` | | Tests for repository configuration and public files. |

The dependency graph forms a star around `@trellis/api`.
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
Confirm that the test fails for the intended reason.
Make the test pass without deletion or weaker assertions.
Send a disputed test to the lead with the reason.

## Database migration

1. Change `apps/server/src/db/schema.ts`.
2. Run `bun run db:generate`.
3. Commit the generated SQL and the `meta/` directory with the schema change.

Do not edit a generated migration.
The check fails when schema generation changes `apps/server/drizzle/`.

## Review pass

1. Read the complete diff and remove unrelated changes.
2. Run the focused tests again.
3. Run `bun run check --force` at the repository root.
4. Ask reviewers to refute the tests, correctness, and code quality.
5. Give each finding a file, line, severity, claim, and evidence.
6. Add a failing test for each missing case before the fix.
7. Repeat the review until a pass has no findings.

Two reviewers must agree on a finding unless one reviewer marks it as a blocker.
Do not merge from one reviewer only.
