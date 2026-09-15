# Manager recovery UI

The manager page exposes a versioned preview for local execution. The preview lists external assignments, terminal IDs, workspace IDs, conversations, and blockers.

A person must confirm that an external process stopped before Trellis retires its assignment. Retirement preserves history and shows the saved dispatch pause immediately. Cancellation preserves an unknown receipt and records the person's reason. Cancelled rows remain in queue history and leave the attention panel.

The migration requires an absolute repository directory and explicit confirmation. The resulting project uses native execution with automatic dispatch paused and repository trust disabled. A retired external manager does not prevent a fresh local start.

## Checks

- `bun test src/domain/NativeMigrationReview src/domain/RecoveryDecisionDialog` in `packages/ui`: 4 pass, 15 assertions.
- `bun test src/features/project-manager/recoveryError` in `apps/web`: 2 pass, 3 assertions.
- `bun test src/features/project-manager/ProjectManagerPage/managerResumes` in `apps/web`: 2 pass, 5 assertions. This final label guard prevents a stopped external session from resuming as a native manager.
- Web and UI `bun run typecheck`: pass.
- Scoped Biome check across 21 files: pass.
- `bun run e2e manager-recovery.spec.ts --project flows --no-deps --output /tmp/trellis-recovery-final-accepted-output` in `apps/web`: 2 pass in 23.1 seconds.
- The E2E tests use a real server and an isolated Superset stub. They cover stale preview rejection, the directory picker, retirement, unknown receipt cancellation, preserved history, visible pause, actionable API reasons, and fresh local start eligibility.
- The status regression fails before the unavailable label exists. The post-migration regression fails when the retired row keeps Resume disabled. The pause regression fails when the draft retains a checked dispatch switch. The preview error regression fails with the generic schema message.
- Button and IconButton tests alone reproduce 3 existing failures: disabled variant classes and two SVG `aria-hidden` assertions. The recovery changes do not modify those primitives.

## Aside verification

The source web app runs against the isolated home `/tmp/trellis-recovery-qa-I4eO15/home` on ports 53618 and 53619. The fixture uses project QAR and a simulated external manager. The check does not modify the person's Trellis data.

Aside session: `/Users/navidkhan/.aside/u/0/sessions/2026-09-14_sOY7OUefOsaRHbCQ`.

The live DOM confirms these states:

- `External session unavailable`, with Resume disabled and the old assignment IDs visible.
- `Cancel delivery?`, with the unknown receipt explanation and a required reason.
- `Retire assignment?`, with the exact workspace, terminal, and conversation IDs and a required stopped-process checkbox.
- After migration: Automatic dispatch is unchecked, Start manager is available, and the old assignment and cancelled receipt remain visible.

The adjacent screenshots show the preview, both confirmation dialogs, and the paused result. No local agent starts during this browser check. The scratch host, Vite server, and Aside tab are closed after the check.
