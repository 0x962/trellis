# Contributing

Read [AGENTS.md](AGENTS.md) first. It defines the repository rules.
The [approved plan](docs/design/plan.md) defines the product.

## Development loop

Run the fake server and the web app in separate terminals.

```sh
bun install
bun run --cwd apps/web dev:fake
```

```sh
TRELLIS_API_URL=http://127.0.0.1:4522 bun run --cwd apps/web dev
```

Open `http://127.0.0.1:5173`.
The fake server deletes its data when it restarts.
For the end-to-end suite, Playwright starts both processes.

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
| `apps/web` | `@trellis/web` | The React web app and its fake server. |
| `apps/mobile` | `@trellis/mobile` | The Expo mobile app. |
| `docs/design` | | The approved plan and the design documents behind it. |
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
If you think a test is wrong, send it to the lead with the reason.

## Database migration

1. Change `apps/server/src/db/schema.ts`.
2. Run `bun run db:generate`.
3. Commit the generated SQL and the `meta/` directory with the schema change.

Do not edit a generated migration.
The check fails when schema generation changes `apps/server/drizzle/`.

## Review pass

1. Read the full diff and remove changes that are not part of the work.
2. Run the focused tests again.
3. Run `bun run check --force` at the repository root.
4. Ask reviewers to refute the tests, the correctness, and the code quality.
5. Give each finding a file, a line, a severity, a claim, and evidence.
6. For each missing case, add a failing test before the fix.
7. Do the review again until a pass has no findings.

A finding needs two reviewers who agree, unless one reviewer marks it as a blocker.
Do not merge on the word of one reviewer.
