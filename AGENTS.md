# Repo rules for every agent

trellis is a local ticket tracker for agent-driven work. `docs/ARCHITECTURE.md` describes the system. Read this file before you write code.

## Work

- Assess the risk of each change. Balance speed with the cost of an error.
- Run the linters and type checks that cover the changed code.
- Report the checks you ran, their results, and any relevant gaps.
- A commit message carries no session trailer. Add no trailer and no URL that points at an agent session.
- Every pull request description states what broke, what changed, and one verification sentence. No headers, no tables, no checklists.
- Pin exact versions when you add a dependency. Prefer the current release on npm.

Create a scratch checkout or a temporary directory only under `$TMPDIR`, with the `trellis-` prefix. Remove it, and stop every server you started, before you report the ticket as done. A directory that nobody removes stays until the disk is full.

## Prompts

- Flow nodes store their instructions directly.
- A ticket assignment receives its task from the ticket title and description. `assignmentInstruction` in `apps/server/src/services/brief.ts` adds the ticket identifier, the branch of the worktree, and the trellis commands.
- Each ticket agent completes its assigned work and records the result.
- A ticket agent keeps its assignment until a person removes it.

## Desktop install

Release workers coordinate directly so one SRE owns each shared release cycle. Group eligible tickets into one merge, check, build, install, and restart cycle.

Production builds require a clean `main` checkout at the current `origin/main` commit. Merge each feature branch into `main` and push it before a production build. Never build a production app from a feature branch or a detached commit. This rule also applies to `--prepare` candidates. Do not bypass the production installer.

Run `bun run desktop:install` from the `main` checkout. The command builds and verifies a fresh package, then copies it to `~/Applications/Trellis.app`. The copy leaves Trellis open. Restart Trellis to activate the package. Activation stops the previous runtime and starts the host. Trellis preserves ticket assignments. See [the desktop guide](apps/desktop/README.md#production-install) for candidate builds and verification.

Preserve provider conversations and workspaces during prompt updates and deployment. Trellis resumes compatible conversations at the next automatic start. The `--new-session` flag resets a conversation and requires an explicit human reset.

Check `df -h /System/Volumes/Data` before a production build. A build needs at least 3 GB of free space and writes its files under `$TMPDIR/trellis-production-*`. A failed build keeps that directory for inspection, and the next build removes the build directories that are older than two hours. The installer keeps every release under `~/Library/Application Support/Trellis/releases`. At each host start the desktop service removes each release that is neither active nor installed and that no live process runs from. The server sweeps `~/.trellis/agents` and `~/.trellis/harness-attempts` at boot and then once an hour: it removes the clean worktree of a run that is closed on a done or canceled ticket, the output files of earlier terminals, and the attempt directory that no run holds. On 2026-09-16, 4408 build and test directories under `$TMPDIR` and 43 old releases filled the disk, and Trellis stopped for every agent.

## Repository access

Trellis automatically trusts configured project repositories and directories required by assigned work. Do not ask for a separate repository or directory trust approval. A subproject with no directory uses its nearest configured parent directory. Ask for a repository location only when neither project context nor an ancestor identifies it.

## Prose and comments

- Write every sentence in ASD-STE100 Simplified Technical English (STE): one topic per sentence, active voice, simple present tense.
- A comment states an invariant, a constraint, or a consequence for a reader with zero context. A comment never states a change history, an absence, or a contrast with a former version.
- No em dashes. No emoji.

## Code

- Happy path only: no fallbacks, no retries, no defensive checks on internal inputs. Let an error crash at the failure point.
- Keep error handling for the system boundaries: user input, the gh binary, and the network.
- `tx` first: every query takes `(tx, input)`, and every service takes `(ctx, tx, input)`. A function that touches the database receives `tx` and never imports a module-level `db`. Only `db/client.ts` and `db/tx.ts` hold a module-level `db`. A nested query inside a PGlite transaction deadlocks the server. Biome fails `lint` on an import of `db/client` from outside `db/`.
- Layers import downward only. Server, web, mobile, and cli import `api`. Only web imports `ui`. Packages export TypeScript source and have no side effects.
- One folder per module or component: `Name/Name.ts(x)`, `Name/index.ts`. If one module uses it, nest it under that module's `components/`. If two use it, move it to the highest shared parent.
- One exported component or service per file. Split a file over 300 lines.
- Names: `camelCase` files for modules, `PascalCase` folders for React components, `kebab-case` for routes and CLI commands. Schema `TicketSummarySchema`, type `TicketSummary`, table `tickets`, service `tickets.ts`, procedure file `tickets.ts`, CLI command `list.ts`.
- Tabs for indentation. Biome formats and lints. `bun run lint:fix` applies the fixes.

## UI

- Read [UI patterns](docs/UI_PATTERNS.md) before a UI change. Reuse the canonical components and the matching board or table pattern.
- Do not invent a page-specific control, group header, icon treatment, or row layout when a canonical element covers the need.
- Before adding a new UI element or interaction pattern, explain the gap and ask the user for advice. Wait for the answer.
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

## Review

Read the full diff before you open a pull request. Remove every change that is not part of the work. Try to refute your own change first. State each finding with a file, a line, a claim, and evidence.
