# Repo rules for every agent

trellis is a local ticket tracker for agent-driven work. `docs/ARCHITECTURE.md` describes the system. Read this file before you write code.

## Work

- Assess the risk of each change. Balance speed with the cost of an error.
- Start each change with a failing test. A behavior change without a test does not merge.
- Choose tests and checks that cover the changed behavior and affected code. Use broader checks when the risk warrants them.
- Treat the full `bun run check` command as optional. Performance tests are optional for handoffs, pull requests, and merges.
- Decide whether a browser check adds useful evidence for the change.
- Report the checks you ran, their results, and any relevant gaps.
- A commit message carries no session trailer. Add no trailer and no URL that points at an agent session.
- Every pull request description states what broke, what changed, and one verification sentence. No headers, no tables, no checklists.
- Pin exact versions when you add a dependency. Prefer the current release on npm.

## Desktop install

Commit the source changes, then run `bun run desktop:install` from the repository root. The command builds and verifies a fresh package, then copies it to `~/Applications/Trellis.app`. The copy leaves Trellis open. Restart Trellis to activate the package; a changed package stops active agents before the new runtime starts. See [the desktop guide](apps/desktop/README.md#production-install) for candidate builds and verification.

## Prose and comments

- Write every sentence in ASD-STE100 Simplified Technical English (STE): one topic per sentence, active voice, simple present tense.
- A comment states an invariant, a constraint, or a consequence for a reader with zero context. A comment never states a change history, an absence, or a contrast with a former version.
- No em dashes. No emoji.

## Code

- Happy path only: no fallbacks, no retries, no defensive checks on internal inputs. Let an error crash at the failure point.
- Keep error handling for the system boundaries: user input, the gh binary, and the network.
- `tx` first: every query takes `(tx, input)`, and every service takes `(ctx, tx, input)`. A function that touches the database receives `tx` and never imports a module-level `db`. Only `db/client.ts` and `db/tx.ts` hold a module-level `db`. A nested query inside a PGlite transaction deadlocks the server. Biome fails `lint` on an import of `db/client` from outside `db/`.
- Layers import downward only. Server, web, mobile, and cli import `api`. Only web imports `ui`. Packages export TypeScript source and have no side effects.
- One folder per module or component: `Name/Name.ts(x)`, `Name/Name.test.ts(x)`, `Name/index.ts`. If one module uses it, nest it under that module's `components/`. If two use it, move it to the highest shared parent.
- One exported component or service per file. Split a file over 300 lines.
- A unit test sits beside the code it tests. An integration test sits under `<workspace>/test/int/`, at the path it would have beside that code. Fixtures and helpers live in `test/` at the workspace root. Perf and e2e suites are directories.
- Names: `camelCase` files for modules, `PascalCase` folders for React components, `kebab-case` for routes and CLI commands. Schema `TicketSummarySchema`, type `TicketSummary`, table `tickets`, service `tickets.ts`, procedure file `tickets.ts`, CLI command `list.ts`.
- Tabs for indentation. Biome formats and lints. `bun run lint:fix` applies the fixes.

## UI

- No shadcn, no Radix. Base UI gives behavior and accessibility. Every visual lives in `packages/ui`.
- Every icon button is a circle. `IconButton` always draws one. Give an icon action an `IconButton` and a `Tooltip` that names it. Do not put an icon and a word on one `Button` in a bar, on a canvas, or in a panel.
- A `Button` with text is for a form action in a dialog or a sheet, such as Save, Cancel, or Delete.
- For animation, use only `motion/mini` and CSS transitions. Never animate re-sorts, text changes, counters, skeleton swaps, or the theme switch.
- No raw color or spacing literal outside `packages/ui`. Use the tokens.
- Every UI item passes the design checklist:
  - optical alignment
  - tabular numbers
  - hover, active, focus, and disabled states
  - no layout shift when data arrives
  - hit areas of 28 px on desktop and 44 px on mobile
  - contrast
  - density per spec
  - motion durations per the token table
  - reduced motion
  - empty, loading, and error states

## Tests

`bun run test` runs the unit tests and takes seconds. `bun run test:int` runs the integration tests and takes minutes. Run `test:int` before a pull request, and when your change touches the database, the app wiring, or the CLI.

A test is an integration test when it opens a PGlite database, boots the Hono app, or spawns a process. Those cost about half a second each, every time a file asks for one. `test/testLayout.test.ts` reads every test file, follows its imports, and fails when a file of that kind sits outside `test/int/`.

| kind | where | runs in |
|---|---|---|
| unit | beside the module, `*.test.ts` | `bun run test`, no database, no process |
| integration | `<workspace>/test/int/`, mirroring the source path | `bun run test:int`, in-memory PGlite, the app, spawned servers |
| contract | `apps/server/test/int/src/procedures/` | `bun run test:int`, oRPC client over `app.request` |
| component | `packages/ui`, beside the component | `bun run test`, Testing Library, happy-dom, no server |
| CLI smoke | `packages/cli/test/int/` | `bun run test:int`, spawned server on a random port |
| perf | `apps/server/test/perf/`, `apps/web/scripts/size-budget.ts` | optional `perf:10k` at 10k rows, `perf` at 50k rows |
| e2e | `apps/web/e2e/` | Playwright with a temp `TRELLIS_HOME` |

`apps/web` holds no component test. A page that renders is covered by the Playwright specs in `apps/web/e2e`, which drive a real browser against a real server. A component on its own is covered in `packages/ui`, which mounts it with no server and no database. `apps/web/test/server` builds the real Hono app of `apps/server` over an in-memory PGlite for the few tests that need it.

An integration test that reads a file by path calls `originDir(import.meta.dir)` from `test/originDir.ts`, because its own directory sits under `test/int/` and holds no source. Every service test ends with `assertStatusInvariant(tx)`. `test/preload.ts` gives a test run a fresh `TRELLIS_HOME`, so a test never touches `~/.trellis`. Bun reads `bunfig.toml` from the current directory only. So every workspace has a `bunfig.toml` with `[test]` and `preload = ["../../test/preload.ts"]`. A root test checks this for every directory under `apps/` and `packages/` that has a `package.json`.

## Review

Read the full diff before you open a pull request. Remove every change that is not part of the work. Try to refute your own change first. State each finding with a file, a line, a claim, and evidence. Turn a missing case into a failing test before you fix it.
