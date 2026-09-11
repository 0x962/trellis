# Repo rules for every agent

trellis is a local ticket tracker for agent-driven work. The plan is `docs/design/plan.md`. Where any other document disagrees with the plan, the plan wins. Read this file before you write a line.

## Work

- Every work item is test-driven. Write a failing test for the outcome before implementation. Make it pass. Never delete or weaken a test.
- A test you believe is wrong goes back to the lead with the reason. Do not edit it.
- Assess the risk of each change. Balance speed with the cost of an error.
- Choose tests and checks that cover the changed behavior and affected code. Use broader checks when the risk warrants them.
- Treat the full `bun run check` command as optional. Performance tests are optional for handoffs, pull requests, and merges.
- Use one agent for tests, implementation, and review.
- Decide whether a browser check adds useful evidence for the change.
- Report the checks you ran, their results, and any relevant gaps.
- Commit on small units. The commit subject states the user-visible result. The body ends with the `Claude-Session:` trailer.
- Every PR description states what broke, what changed, and one verification sentence. No headers, no tables, no checklists.
- Pin exact versions when you add a dependency. Prefer the current release on npm.

## Prose and comments

- Write every sentence in ASD-STE100 Simplified Technical English (STE): one topic per sentence, active voice, simple present tense, 20 words or less per instruction, 25 words or less per description.
- Comments state an invariant, a constraint, or a consequence for a reader with zero context. Never a change history, never an absence, never a contrast with a former version.
- No em dashes. No emoji.

## Code

- Happy path only: no fallbacks, no retries, no defensive checks on internal inputs. Let an error crash at the failure point.
- Reserve error handling for the system boundaries: user input, the gh binary, the network.
- `tx` first: every query takes `(tx, input)` and every service takes `(ctx, tx, input)`; a function that touches the database receives `tx` and never imports a module-level `db`. No module-level `db` outside `db/client.ts` and `db/tx.ts`. A nested query inside a PGlite transaction deadlocks the server. Biome fails `lint` on an import of `db/client` from outside `db/`.
- Layers import downward only: `api` is imported by server, web, mobile, and cli; `ui` is imported by web only. Packages export TypeScript source and are side-effect free.
- One folder per module or component: `Name/Name.ts(x)`, `Name/Name.test.ts(x)`, `Name/index.ts`. Used once: nest under the user's `components/`. Used twice: promote to the highest shared parent.
- One exported component or service per file. A file over 300 lines gets split.
- Tests sit beside the code they test. Fixtures and helpers live in `test/` at the workspace root. Perf and e2e suites are directories.
- Names: `camelCase` files for modules, `PascalCase` folders for React components, `kebab-case` for routes and CLI commands. Schema `TicketSummarySchema`, type `TicketSummary`, table `tickets`, service `tickets.ts`, procedure file `tickets.ts`, CLI command `list.ts`.
- Tabs for indentation. Biome formats and lints; `bun run lint:fix` applies the fixes.

## UI

- No shadcn, no Radix. Base UI gives behavior and accessibility; every visual lives in `packages/ui`.
- Animation is `motion/mini` and CSS transitions only. Never animate re-sorts, text changes, counters, skeleton swaps, or the theme switch.
- No raw color or spacing literal outside `packages/ui`. Use the tokens.
- Every UI item passes the design checklist: optical alignment; tabular numbers; hover, active, focus, disabled states; no layout shift on data arrival; hit areas of 28 px on desktop and 44 px on mobile; contrast; density per spec; motion durations per the token table; reduced motion; empty, loading, and error states.

## Tests

| kind | where | runs in |
|---|---|---|
| unit | beside the module, `*.test.ts` | `bun test`, in-memory PGlite, inline transport |
| contract | `apps/server/src/procedures/*.test.ts` | `bun test`, oRPC client over `app.request` |
| component | beside the component, `*.test.tsx` | `bun test`, Testing Library, happy-dom |
| CLI smoke | `packages/cli/test/` | `bun test`, spawned server on a random port |
| perf | `apps/server/test/perf/`, `apps/web/scripts/size-budget.ts` | optional `perf:10k` at 10k rows, `perf` at 50k rows |
| e2e | `apps/web/e2e/` | Playwright with a temp `TRELLIS_HOME` |

Every service test ends with `assertStatusInvariant(tx)`. `test/preload.ts` gives a test run a fresh `TRELLIS_HOME`, so a test never touches `~/.trellis`. Bun reads `bunfig.toml` from the current directory only, so every workspace ships a `bunfig.toml` with `[test]` and `preload = ["../../test/preload.ts"]`. A root test asserts it for every directory under `apps/` and `packages/` that holds a `package.json`.

## Review

Read the full diff and try to refute your own change. State each finding with a file, a line, a claim, and evidence. Turn a missing case into a failing test before you fix it.
